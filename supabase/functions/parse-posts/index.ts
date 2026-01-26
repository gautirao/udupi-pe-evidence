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

interface GeocodedLocation {
  latitude: number
  longitude: number
  display_name: string | null
}

interface LogEvent {
  type: 'info' | 'success' | 'warning' | 'error' | 'ai'
  message: string
  details?: string
  timestamp: string
}

// Exponential backoff retry configuration
const RETRY_CONFIG = {
  maxRetries: 5,
  baseDelayMs: 1000,
  maxDelayMs: 32000,
  retryableStatuses: [429, 500, 502, 503, 504]
}

// Sleep helper
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Exponential backoff retry wrapper for AI API calls
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  onRetry?: (attempt: number, delay: number, status: number) => void
): Promise<Response> {
  let lastError: Error | null = null
  let lastStatus = 0
  
  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      const response = await fetch(url, options)
      
      // If successful or non-retryable error, return immediately
      if (response.ok || !RETRY_CONFIG.retryableStatuses.includes(response.status)) {
        return response
      }
      
      lastStatus = response.status
      
      // Check if we've exhausted retries
      if (attempt === RETRY_CONFIG.maxRetries) {
        return response
      }
      
      // Calculate delay with exponential backoff and jitter
      const exponentialDelay = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt)
      const jitter = Math.random() * 0.3 * exponentialDelay // 0-30% jitter
      const delay = Math.min(exponentialDelay + jitter, RETRY_CONFIG.maxDelayMs)
      
      // Notify caller about retry
      if (onRetry) {
        onRetry(attempt + 1, Math.round(delay), response.status)
      }
      
      await sleep(delay)
      
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('Unknown fetch error')
      
      // Check if we've exhausted retries
      if (attempt === RETRY_CONFIG.maxRetries) {
        throw lastError
      }
      
      // Calculate delay for network errors
      const exponentialDelay = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt)
      const delay = Math.min(exponentialDelay, RETRY_CONFIG.maxDelayMs)
      
      if (onRetry) {
        onRetry(attempt + 1, Math.round(delay), 0)
      }
      
      await sleep(delay)
    }
  }
  
  // This shouldn't be reached, but just in case
  throw lastError || new Error(`Failed after ${RETRY_CONFIG.maxRetries} retries with status ${lastStatus}`)
}

// Normalize property type synonyms to enum values
function normalizePropertyType(type: string): 'house' | 'apartment' | 'land' | 'commercial' | 'other' {
  const normalized = type.toLowerCase().trim()
  
  const apartmentSynonyms = ['flat', 'flats', 'apartment', 'apartments', 'condo', 'condominium', 'unit', 'studio']
  if (apartmentSynonyms.includes(normalized)) return 'apartment'
  
  const houseSynonyms = ['house', 'home', 'villa', 'bungalow', 'duplex', 'townhouse', 'cottage', 'mansion', 'residence']
  if (houseSynonyms.includes(normalized)) return 'house'
  
  const landSynonyms = ['land', 'plot', 'site', 'lot', 'acre', 'acres', 'ground', 'property']
  if (landSynonyms.includes(normalized)) return 'land'
  
  const commercialSynonyms = ['commercial', 'shop', 'office', 'warehouse', 'godown', 'showroom', 'retail', 'industrial', 'business']
  if (commercialSynonyms.includes(normalized)) return 'commercial'
  
  if (['house', 'apartment', 'land', 'commercial', 'other'].includes(normalized)) {
    return normalized as 'house' | 'apartment' | 'land' | 'commercial' | 'other'
  }
  
  return 'other'
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

// Check for duplicate listings based on key attributes
async function checkForDuplicate(
  supabase: any,
  parsed: ParsedProperty,
  normalizedType: string
): Promise<{ isDuplicate: boolean; matchedId: string | null; matchReason: string | null }> {
  // Strategy 1: Exact phone match (strongest signal)
  if (parsed.contact_phone) {
    const normalizedPhone = parsed.contact_phone.replace(/\D/g, '').slice(-10) // Last 10 digits
    const { data: phoneMatches } = await supabase
      .from('property_listings')
      .select('id, locality, property_type')
      .ilike('contact_phone', `%${normalizedPhone}%`)
      .eq('property_type', normalizedType)
      .limit(1)
    
    if (phoneMatches && phoneMatches.length > 0) {
      return { 
        isDuplicate: true, 
        matchedId: phoneMatches[0].id, 
        matchReason: `phone match in ${phoneMatches[0].locality || 'unknown location'}`
      }
    }
  }
  
  // Strategy 2: Same locality + property type + similar price (within 10%)
  if (parsed.locality && parsed.price) {
    const priceLow = parsed.price * 0.9
    const priceHigh = parsed.price * 1.1
    
    const { data: priceMatches } = await supabase
      .from('property_listings')
      .select('id, price, contact_phone')
      .eq('property_type', normalizedType)
      .ilike('locality', `%${parsed.locality.trim()}%`)
      .gte('price', priceLow)
      .lte('price', priceHigh)
      .limit(1)
    
    if (priceMatches && priceMatches.length > 0) {
      return { 
        isDuplicate: true, 
        matchedId: priceMatches[0].id, 
        matchReason: `same locality/type/price (₹${Math.round(priceMatches[0].price)})`
      }
    }
  }
  
  // Strategy 3: Same locality + bedrooms + bathrooms (for residential)
  if (parsed.locality && parsed.bedrooms && ['house', 'apartment'].includes(normalizedType)) {
    const { data: specMatches } = await supabase
      .from('property_listings')
      .select('id, price')
      .eq('property_type', normalizedType)
      .ilike('locality', `%${parsed.locality.trim()}%`)
      .eq('bedrooms', parsed.bedrooms)
      .eq('bathrooms', parsed.bathrooms || 0)
      .limit(1)
    
    if (specMatches && specMatches.length > 0) {
      return { 
        isDuplicate: true, 
        matchedId: specMatches[0].id, 
        matchReason: `same specs (${parsed.bedrooms}BHK in ${parsed.locality})`
      }
    }
  }
  
  return { isDuplicate: false, matchedId: null, matchReason: null }
}

async function geocodeLocality(
  supabase: any,
  locality: string
): Promise<GeocodedLocation | null> {
  const normalizedLocality = locality.trim().toLowerCase()
  
  const { data: cached, error: cacheError } = await supabase
    .from('geocode_cache')
    .select('latitude, longitude, display_name')
    .ilike('locality', normalizedLocality)
    .limit(1)
    .maybeSingle()
  
  if (!cacheError && cached) {
    return {
      latitude: cached.latitude,
      longitude: cached.longitude,
      display_name: cached.display_name
    }
  }
  
  const searchQuery = `${locality}, Karnataka, India`
  const nominatimUrl = `https://nominatim.openstreetmap.org/search?` +
    `q=${encodeURIComponent(searchQuery)}` +
    `&format=json&limit=1&countrycodes=in`
  
  try {
    const response = await fetch(nominatimUrl, {
      headers: { 'User-Agent': 'UdupiPropertyTracker/1.0 (property listing aggregator)' }
    })
    
    if (!response.ok) return null
    
    const results = await response.json()
    if (!results || results.length === 0) return null
    
    const result = results[0]
    const latitude = parseFloat(result.lat)
    const longitude = parseFloat(result.lon)
    const display_name = result.display_name
    
    await supabase.from('geocode_cache').insert({
      locality: normalizedLocality,
      latitude,
      longitude,
      display_name
    })
    
    return { latitude, longitude, display_name }
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
  if (!LOVABLE_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'LOVABLE_API_KEY is not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseKey)

  let batchSize = 10
  let feedRunId: string | null = null
  let streaming = false
  
  try {
    const body = await req.json()
    if (body.batch_size) batchSize = Math.min(body.batch_size, 50)
    if (body.feed_run_id) feedRunId = body.feed_run_id
    if (body.stream) streaming = true
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
    return new Response(
      JSON.stringify({ error: fetchError.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (!rawPosts || rawPosts.length === 0) {
    if (streaming) {
      const encoder = new TextEncoder()
      const body = new ReadableStream({
        start(controller) {
          const event: LogEvent = { type: 'info', message: 'No unprocessed posts found', timestamp: new Date().toISOString() }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
          const done = { type: 'done', processed: 0, listings_created: 0, geocoded: 0, failed: 0 }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(done)}\n\n`))
          controller.close()
        }
      })
      return new Response(body, { headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } })
    }
    return new Response(
      JSON.stringify({ success: true, processed: 0, listings_created: 0, message: 'No unprocessed posts found' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Streaming mode
  if (streaming) {
    const encoder = new TextEncoder()
    
    const body = new ReadableStream({
      async start(controller) {
        const sendLog = (type: LogEvent['type'], message: string, details?: string) => {
          const event: LogEvent = { type, message, details, timestamp: new Date().toISOString() }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
          console.log(`[parse-posts] [${type.toUpperCase()}] ${message}${details ? ` - ${details}` : ''}`)
        }

        let listingsCreated = 0
        let postsProcessed = 0
        let postsFailed = 0
        let geocodedCount = 0
        const failedPosts: { id: string; reason: string; content_preview: string }[] = []

        sendLog('info', `Starting batch processing`, `${rawPosts.length} posts to process`)

        for (let i = 0; i < rawPosts.length; i++) {
          const post = rawPosts[i]
          const contentPreview = post.content.substring(0, 80).replace(/\n/g, ' ')
          
          try {
            sendLog('ai', `Processing post ${i + 1}/${rawPosts.length}`, `"${contentPreview}..."`)

            const aiResponse = await fetchWithRetry(
              'https://ai.gateway.lovable.dev/v1/chat/completions',
              {
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
              },
              (attempt, delay, status) => {
                sendLog('warning', `Rate limited (${status}), retry ${attempt}/${RETRY_CONFIG.maxRetries}`, `waiting ${(delay / 1000).toFixed(1)}s`)
              }
            )

            if (!aiResponse.ok) {
              const errorText = await aiResponse.text()
              const reason = `AI API error: ${aiResponse.status}${aiResponse.status === 429 ? ' (rate limit exhausted)' : ''}`
              sendLog('error', `Failed: ${reason}`, errorText.substring(0, 150))
              failedPosts.push({ id: post.id, reason, content_preview: contentPreview })
              postsFailed++
              continue
            }

            const aiData = await aiResponse.json()
            const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0]
            
            if (!toolCall?.function?.arguments) {
              const reason = 'No tool call in AI response'
              sendLog('error', `Failed: ${reason}`)
              failedPosts.push({ id: post.id, reason, content_preview: contentPreview })
              postsFailed++
              continue
            }

            const parsed: ParsedProperty = JSON.parse(toolCall.function.arguments)
            
            sendLog('ai', `AI result: ${parsed.is_real_estate ? 'Real estate' : 'Not real estate'}`, 
              `type=${parsed.property_type}, confidence=${parsed.confidence_score}%`)

            if (parsed.is_real_estate && parsed.confidence_score >= 50) {
              let latitude: number | null = null
              let longitude: number | null = null
              
              if (parsed.locality) {
                sendLog('info', `Geocoding locality`, `"${parsed.locality}"`)
                const geocoded = await geocodeLocality(supabase, parsed.locality)
                if (geocoded) {
                  latitude = geocoded.latitude
                  longitude = geocoded.longitude
                  geocodedCount++
                  sendLog('success', `Geocoded`, `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`)
                } else {
                  sendLog('warning', `Geocoding failed`, `No results for "${parsed.locality}"`)
                }
              }

              const normalizedType = normalizePropertyType(parsed.property_type)
              if (normalizedType !== parsed.property_type) {
                sendLog('info', `Normalized type`, `"${parsed.property_type}" → "${normalizedType}"`)
              }

              // Check for duplicates before inserting
              const duplicateCheck = await checkForDuplicate(supabase, parsed, normalizedType)
              
              const { error: insertError } = await supabase
                .from('property_listings')
                .insert({
                  raw_post_id: post.id,
                  property_type: normalizedType,
                  price: parsed.price,
                  price_unit: parsed.price_unit || 'INR',
                  locality: parsed.locality,
                  latitude,
                  longitude,
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
                  is_duplicate: duplicateCheck.isDuplicate,
                  parsed_data: parsed
                })

              if (insertError) {
                sendLog('error', `DB insert failed`, insertError.message)
                failedPosts.push({ id: post.id, reason: insertError.message, content_preview: contentPreview })
                postsFailed++
              } else {
                listingsCreated++
                if (duplicateCheck.isDuplicate) {
                  sendLog('warning', `Created listing (DUPLICATE)`, 
                    `${normalizedType} - ${duplicateCheck.matchReason}`)
                } else {
                  sendLog('success', `Created listing`, 
                    `${normalizedType} in ${parsed.locality || 'unknown location'}${parsed.price ? ` - ₹${parsed.price}` : ''}`)
                }
              }
            } else {
              const reason = parsed.is_real_estate ? `Low confidence (${parsed.confidence_score}%)` : 'Not real estate'
              sendLog('info', `Skipped`, reason)
            }

            await supabase.from('raw_posts').update({ is_processed: true }).eq('id', post.id)
            postsProcessed++

          } catch (err) {
            const reason = err instanceof Error ? err.message : 'Unknown error'
            sendLog('error', `Exception processing post`, reason)
            failedPosts.push({ id: post.id, reason, content_preview: contentPreview })
            postsFailed++
          }
        }

        if (feedRunId) {
          await supabase.from('feed_runs').update({ posts_parsed: postsProcessed, posts_failed: postsFailed }).eq('id', feedRunId)
        }

        sendLog('success', `Batch complete`, 
          `Processed: ${postsProcessed}, Created: ${listingsCreated}, Geocoded: ${geocodedCount}, Failed: ${postsFailed}`)

        // Send final done event with summary
        const done = { 
          type: 'done', 
          processed: postsProcessed, 
          listings_created: listingsCreated, 
          geocoded: geocodedCount, 
          failed: postsFailed,
          failed_posts: failedPosts
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(done)}\n\n`))
        controller.close()
      }
    })

    return new Response(body, { 
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      } 
    })
  }

  // Non-streaming mode (original behavior)
  console.log(`[parse-posts] Processing ${rawPosts.length} posts (non-streaming)`)

  let listingsCreated = 0
  let postsProcessed = 0
  let postsFailed = 0
  let geocodedCount = 0
  const failedPosts: { id: string; reason: string; content_preview: string }[] = []

  for (const post of rawPosts) {
    try {
      const contentPreview = post.content.substring(0, 100).replace(/\n/g, ' ')
      
      const aiResponse = await fetchWithRetry(
        'https://ai.gateway.lovable.dev/v1/chat/completions',
        {
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
                    is_real_estate: { type: 'boolean' },
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
        },
        (attempt, delay, status) => {
          console.log(`[parse-posts] Rate limited (${status}), retry ${attempt}/${RETRY_CONFIG.maxRetries}, waiting ${delay}ms`)
        }
      )

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text()
        failedPosts.push({ id: post.id, reason: `AI error: ${aiResponse.status}${aiResponse.status === 429 ? ' (rate limit exhausted)' : ''}`, content_preview: contentPreview })
        postsFailed++
        continue
      }

      const aiData = await aiResponse.json()
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0]
      
      if (!toolCall?.function?.arguments) {
        failedPosts.push({ id: post.id, reason: 'No tool call', content_preview: contentPreview })
        postsFailed++
        continue
      }

      const parsed: ParsedProperty = JSON.parse(toolCall.function.arguments)

      if (parsed.is_real_estate && parsed.confidence_score >= 50) {
        let latitude: number | null = null
        let longitude: number | null = null
        
        if (parsed.locality) {
          const geocoded = await geocodeLocality(supabase, parsed.locality)
          if (geocoded) {
            latitude = geocoded.latitude
            longitude = geocoded.longitude
            geocodedCount++
          }
        }

        const normalizedType = normalizePropertyType(parsed.property_type)

        // Check for duplicates before inserting
        const duplicateCheck = await checkForDuplicate(supabase, parsed, normalizedType)

        const { error: insertError } = await supabase
          .from('property_listings')
          .insert({
            raw_post_id: post.id,
            property_type: normalizedType,
            price: parsed.price,
            price_unit: parsed.price_unit || 'INR',
            locality: parsed.locality,
            latitude,
            longitude,
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
            is_duplicate: duplicateCheck.isDuplicate,
            parsed_data: parsed
          })

        if (insertError) {
          failedPosts.push({ id: post.id, reason: insertError.message, content_preview: contentPreview })
          postsFailed++
        } else {
          listingsCreated++
          if (duplicateCheck.isDuplicate) {
            console.log(`[parse-posts] Created duplicate listing: ${duplicateCheck.matchReason}`)
          }
        }
      }

      await supabase.from('raw_posts').update({ is_processed: true }).eq('id', post.id)
      postsProcessed++

    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Unknown error'
      failedPosts.push({ id: post.id, reason, content_preview: post.content.substring(0, 100) })
      postsFailed++
    }
  }

  if (feedRunId) {
    await supabase.from('feed_runs').update({ posts_parsed: postsProcessed, posts_failed: postsFailed }).eq('id', feedRunId)
  }

  return new Response(
    JSON.stringify({
      success: true,
      processed: postsProcessed,
      listings_created: listingsCreated,
      geocoded: geocodedCount,
      failed: postsFailed,
      failed_posts: failedPosts,
      message: `Processed ${postsProcessed} posts, created ${listingsCreated} listings (${geocodedCount} geocoded)`
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
