import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ParsedProperty {
  is_real_estate: boolean
  property_type: 'house' | 'apartment' | 'land' | 'commercial' | 'other'
  price: number | null
  price_unit: string
  locality: string | null
  bedrooms: number | null
  bathrooms: number | null
  land_area: number | null
  land_area_unit: string | null
  built_area: number | null
  built_area_unit: string | null
  contact_phone: string | null
  contact_info: string | null
  description: string | null
  confidence_score: number
}

const SYSTEM_PROMPT = `You are a real estate listing parser. Your job is to analyze Facebook posts and determine if they are real estate listings.

IMPORTANT: Only classify posts as real estate if they are:
- Properties for sale or rent (houses, apartments, land, commercial spaces)
- Property availability announcements
- Real estate agent listings

DO NOT classify as real estate:
- General discussions about real estate
- Questions about property prices in general
- Home improvement/renovation posts
- Furniture sales
- Roommate searches (unless listing a property)
- Moving services
- Cleaning services

For valid real estate posts, extract:
- property_type: house, apartment, land, commercial, or other
- price: numeric value only (null if not mentioned)
- price_unit: INR, USD, etc. (default: INR)
- locality: neighborhood, area, or city name
- bedrooms: number (null if not mentioned)
- bathrooms: number (null if not mentioned)
- land_area: numeric value (null if not mentioned)
- land_area_unit: sqft, sqm, cents, acres, etc.
- built_area: numeric value (null if not mentioned)
- built_area_unit: sqft, sqm, etc.
- contact_phone: phone number if mentioned
- contact_info: any contact details (name, email, etc.)
- description: brief summary of the property (max 200 chars)
- confidence_score: 0-100 how confident you are this is a real estate listing`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Parse request body for optional parameters
    let batchSize = 10
    let feedRunId: string | null = null
    
    try {
      const body = await req.json()
      if (body.batch_size) batchSize = Math.min(body.batch_size, 50)
      if (body.feed_run_id) feedRunId = body.feed_run_id
    } catch {
      // No body or invalid JSON, use defaults
    }

    // Fetch unprocessed raw posts
    let query = supabase
      .from('raw_posts')
      .select('*')
      .eq('is_processed', false)
      .order('created_at', { ascending: true })
      .limit(batchSize)

    if (feedRunId) {
      query = query.eq('feed_run_id', feedRunId)
    }

    const { data: rawPosts, error: fetchError } = await query

    if (fetchError) {
      console.error('[parse-posts] Error fetching raw posts:', fetchError)
      throw fetchError
    }

    if (!rawPosts || rawPosts.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, listings_created: 0, message: 'No unprocessed posts found' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[parse-posts] Processing ${rawPosts.length} posts`)

    let listingsCreated = 0
    let postsProcessed = 0
    let postsFailed = 0

    for (const post of rawPosts) {
      try {
        console.log(`[parse-posts] Parsing post ${post.id}`)
        
        // Call AI to parse the post
        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-3-flash-preview',
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: `Analyze this Facebook post and determine if it's a real estate listing. If it is, extract the property details.\n\nPost content:\n${post.content}` }
            ],
            tools: [{
              type: 'function',
              function: {
                name: 'parse_property',
                description: 'Parse and classify a property listing from a social media post',
                parameters: {
                  type: 'object',
                  properties: {
                    is_real_estate: { type: 'boolean', description: 'Whether this post is a real estate listing' },
                    property_type: { type: 'string', enum: ['house', 'apartment', 'land', 'commercial', 'other'] },
                    price: { type: 'number', nullable: true },
                    price_unit: { type: 'string', default: 'INR' },
                    locality: { type: 'string', nullable: true },
                    bedrooms: { type: 'number', nullable: true },
                    bathrooms: { type: 'number', nullable: true },
                    land_area: { type: 'number', nullable: true },
                    land_area_unit: { type: 'string', nullable: true },
                    built_area: { type: 'number', nullable: true },
                    built_area_unit: { type: 'string', nullable: true },
                    contact_phone: { type: 'string', nullable: true },
                    contact_info: { type: 'string', nullable: true },
                    description: { type: 'string', nullable: true },
                    confidence_score: { type: 'number', minimum: 0, maximum: 100 }
                  },
                  required: ['is_real_estate', 'property_type', 'confidence_score'],
                  additionalProperties: false
                }
              }
            }],
            tool_choice: { type: 'function', function: { name: 'parse_property' } }
          })
        })

        if (!aiResponse.ok) {
          const errorText = await aiResponse.text()
          console.error(`[parse-posts] AI API error for post ${post.id}:`, aiResponse.status, errorText)
          postsFailed++
          continue
        }

        const aiData = await aiResponse.json()
        const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0]
        
        if (!toolCall?.function?.arguments) {
          console.error(`[parse-posts] No tool call in AI response for post ${post.id}`)
          postsFailed++
          continue
        }

        const parsed: ParsedProperty = JSON.parse(toolCall.function.arguments)
        console.log(`[parse-posts] Post ${post.id} - is_real_estate: ${parsed.is_real_estate}, confidence: ${parsed.confidence_score}`)

        // Only create listing if it's a real estate post with reasonable confidence
        if (parsed.is_real_estate && parsed.confidence_score >= 50) {
          const { error: insertError } = await supabase
            .from('property_listings')
            .insert({
              raw_post_id: post.id,
              property_type: parsed.property_type,
              price: parsed.price,
              price_unit: parsed.price_unit || 'INR',
              locality: parsed.locality,
              bedrooms: parsed.bedrooms,
              bathrooms: parsed.bathrooms,
              land_area: parsed.land_area,
              land_area_unit: parsed.land_area_unit,
              built_area: parsed.built_area,
              built_area_unit: parsed.built_area_unit,
              contact_phone: parsed.contact_phone,
              contact_info: parsed.contact_info,
              description: parsed.description,
              confidence_score: parsed.confidence_score,
              is_valid: parsed.confidence_score >= 70,
              parsed_data: parsed
            })

          if (insertError) {
            console.error(`[parse-posts] Error inserting listing for post ${post.id}:`, insertError)
            postsFailed++
          } else {
            listingsCreated++
            console.log(`[parse-posts] Created listing for post ${post.id}`)
          }
        }

        // Mark post as processed
        await supabase
          .from('raw_posts')
          .update({ is_processed: true })
          .eq('id', post.id)

        postsProcessed++

      } catch (err) {
        console.error(`[parse-posts] Error processing post ${post.id}:`, err)
        postsFailed++
      }
    }

    // Update feed run stats if we have a feed_run_id
    if (feedRunId) {
      await supabase
        .from('feed_runs')
        .update({
          posts_parsed: postsProcessed,
          posts_failed: postsFailed
        })
        .eq('id', feedRunId)
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: postsProcessed,
        listings_created: listingsCreated,
        failed: postsFailed,
        message: `Processed ${postsProcessed} posts, created ${listingsCreated} listings`
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[parse-posts] Unexpected error:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
