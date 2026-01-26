import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface GeocodedLocation {
  latitude: number
  longitude: number
  display_name: string | null
}

interface LogEvent {
  type: 'info' | 'success' | 'warning' | 'error'
  message: string
  details?: string
  timestamp: string
}

// Rate limit delay for Nominatim (1 request per second)
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function geocodeLocality(
  supabase: any,
  locality: string
): Promise<GeocodedLocation | null> {
  const normalizedLocality = locality.trim().toLowerCase()
  
  // Check cache first
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
  
  // Call Nominatim API
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
    
    // Cache the result
    await supabase.from('geocode_cache').insert({
      locality: normalizedLocality,
      latitude,
      longitude,
      display_name
    }).catch(() => {}) // Ignore duplicate key errors
    
    return { latitude, longitude, display_name }
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseKey)

  let batchSize = 20
  let streaming = false
  
  try {
    const body = await req.json()
    if (body.batch_size) batchSize = Math.min(body.batch_size, 50)
    if (body.stream) streaming = true
  } catch {
    // Use defaults
  }

  // Fetch listings with locality but no coordinates
  const { data: listings, error: fetchError } = await supabase
    .from('property_listings')
    .select('id, locality')
    .not('locality', 'is', null)
    .or('latitude.is.null,longitude.is.null')
    .order('created_at', { ascending: false })
    .limit(batchSize)

  if (fetchError) {
    console.error('[geocode-missing] Error fetching listings:', fetchError)
    return new Response(
      JSON.stringify({ error: fetchError.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (!listings || listings.length === 0) {
    if (streaming) {
      const encoder = new TextEncoder()
      const body = new ReadableStream({
        start(controller) {
          const event: LogEvent = { type: 'info', message: 'No listings need geocoding', timestamp: new Date().toISOString() }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
          const done = { type: 'done', processed: 0, geocoded: 0, failed: 0 }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(done)}\n\n`))
          controller.close()
        }
      })
      return new Response(body, { headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } })
    }
    return new Response(
      JSON.stringify({ success: true, processed: 0, geocoded: 0, message: 'No listings need geocoding' }),
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
          console.log(`[geocode-missing] [${type.toUpperCase()}] ${message}${details ? ` - ${details}` : ''}`)
        }

        let geocodedCount = 0
        let failedCount = 0

        sendLog('info', `Starting batch geocoding`, `${listings.length} listings to process`)

        for (let i = 0; i < listings.length; i++) {
          const listing = listings[i]
          
          sendLog('info', `Processing ${i + 1}/${listings.length}`, listing.locality)
          
          const location = await geocodeLocality(supabase, listing.locality)
          
          if (location) {
            const { error: updateError } = await supabase
              .from('property_listings')
              .update({
                latitude: location.latitude,
                longitude: location.longitude
              })
              .eq('id', listing.id)
            
            if (updateError) {
              sendLog('error', `Failed to update ${listing.locality}`, updateError.message)
              failedCount++
            } else {
              sendLog('success', `✓ Geocoded ${listing.locality}`, `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`)
              geocodedCount++
            }
          } else {
            sendLog('warning', `Could not geocode ${listing.locality}`, 'No results from Nominatim')
            failedCount++
          }
          
          // Rate limit: 1 request per second for Nominatim
          if (i < listings.length - 1) {
            await sleep(1100)
          }
        }

        sendLog('info', `Batch complete`, `${geocodedCount} geocoded, ${failedCount} failed`)
        
        const done = { type: 'done', processed: listings.length, geocoded: geocodedCount, failed: failedCount }
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

  // Non-streaming mode
  let geocodedCount = 0
  let failedCount = 0

  for (let i = 0; i < listings.length; i++) {
    const listing = listings[i]
    const location = await geocodeLocality(supabase, listing.locality)
    
    if (location) {
      const { error: updateError } = await supabase
        .from('property_listings')
        .update({
          latitude: location.latitude,
          longitude: location.longitude
        })
        .eq('id', listing.id)
      
      if (!updateError) {
        geocodedCount++
      } else {
        failedCount++
      }
    } else {
      failedCount++
    }
    
    // Rate limit
    if (i < listings.length - 1) {
      await sleep(1100)
    }
  }

  console.log(`[geocode-missing] Complete: ${geocodedCount} geocoded, ${failedCount} failed`)

  return new Response(
    JSON.stringify({
      success: true,
      processed: listings.length,
      geocoded: geocodedCount,
      failed: failedCount
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
