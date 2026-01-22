import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PostImage {
  url: string
  alt?: string | null
  width?: number | null
  height?: number | null
}

interface IncomingPost {
  content: string
  author_name?: string
  posted_at?: string
  external_post_id?: string
  images?: PostImage[]
}

interface IngestRequest {
  posts: IncomingPost[]
  source_url?: string
  group_name?: string
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Validate request method
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const body: IngestRequest = await req.json()
    console.log(`[ingest-posts] Received ${body.posts?.length || 0} posts from ${body.group_name || 'unknown source'}`)

    // Validate posts array
    if (!body.posts || !Array.isArray(body.posts) || body.posts.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No posts provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate each post has content
    const validPosts = body.posts.filter(post => 
      post.content && typeof post.content === 'string' && post.content.trim().length > 10
    )

    if (validPosts.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No valid posts with content' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[ingest-posts] ${validPosts.length} posts passed validation`)

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Find or create a feed run for this batch
    const { data: feedRun, error: feedRunError } = await supabase
      .from('feed_runs')
      .insert({
        status: 'running',
        started_at: new Date().toISOString(),
        posts_fetched: validPosts.length,
        posts_parsed: 0,
        posts_failed: 0,
      })
      .select()
      .single()

    if (feedRunError) {
      console.error('[ingest-posts] Error creating feed run:', feedRunError)
      throw feedRunError
    }

    console.log(`[ingest-posts] Created feed run ${feedRun.id}`)

    // Insert raw posts
    const rawPostsToInsert = validPosts.map(post => ({
      feed_run_id: feedRun.id,
      content: post.content.trim().substring(0, 10000), // Limit content size
      author_name: post.author_name?.substring(0, 255) || null,
      posted_at: post.posted_at ? new Date(post.posted_at).toISOString() : null,
      external_post_id: post.external_post_id?.substring(0, 255) || null,
      source_url: body.source_url?.substring(0, 2000) || null,
      is_processed: false,
      images: post.images || [],
    }))

    // Log image counts
    const totalImages = validPosts.reduce((sum, p) => sum + (p.images?.length || 0), 0)
    console.log(`[ingest-posts] Total images across all posts: ${totalImages}`)

    const { data: insertedPosts, error: insertError } = await supabase
      .from('raw_posts')
      .insert(rawPostsToInsert)
      .select()

    if (insertError) {
      console.error('[ingest-posts] Error inserting raw posts:', insertError)
      
      // Update feed run as failed
      await supabase
        .from('feed_runs')
        .update({
          status: 'failed',
          ended_at: new Date().toISOString(),
          error_log: [{ error: insertError.message, timestamp: new Date().toISOString() }],
        })
        .eq('id', feedRun.id)
      
      throw insertError
    }

    console.log(`[ingest-posts] Inserted ${insertedPosts?.length || 0} raw posts`)

    // Update feed run as successful
    await supabase
      .from('feed_runs')
      .update({
        status: 'success',
        ended_at: new Date().toISOString(),
        posts_fetched: insertedPosts?.length || 0,
      })
      .eq('id', feedRun.id)

    return new Response(
      JSON.stringify({
        success: true,
        imported: insertedPosts?.length || 0,
        feed_run_id: feedRun.id,
        message: `Successfully imported ${insertedPosts?.length || 0} posts`,
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('[ingest-posts] Unexpected error:', error)
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
