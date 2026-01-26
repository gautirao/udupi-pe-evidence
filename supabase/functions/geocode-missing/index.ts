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

// Words to remove from locality names for better geocoding results
const NOISE_WORDS = [
  'highway', 'road', 'rd', 'street', 'st', 'lane', 'ln', 'avenue', 'ave',
  'junction', 'jn', 'jnc', 'circle', 'square', 'cross', 'crossing',
  'beach', 'temple', 'church', 'mosque', 'school', 'college', 'hospital',
  'near', 'opp', 'opposite', 'behind', 'beside', 'next to', 'above', 'below',
  'main', 'bypass', 'nh', 'sh', 'mh', // national/state/municipal highway
  'east', 'west', 'north', 'south',
]

// Simplify locality string for better geocoding
function simplifyLocality(locality: string): string {
  let simplified = locality.toLowerCase()
  
  // Remove noise words (case insensitive, word boundaries)
  for (const word of NOISE_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi')
    simplified = simplified.replace(regex, '')
  }
  
  // Remove extra punctuation and dashes
  simplified = simplified
    .replace(/[-–—]/g, ' ')  // Replace dashes with spaces
    .replace(/[()[\]{}]/g, '') // Remove brackets
    .replace(/\s+/g, ' ')      // Collapse multiple spaces
    .replace(/^\s*,\s*/, '')   // Remove leading comma
    .replace(/\s*,\s*$/, '')   // Remove trailing comma
    .replace(/,\s*,/g, ',')    // Remove empty comma segments
    .trim()
  
  // If we stripped too much, return just the first meaningful part
  const parts = simplified.split(',').map(p => p.trim()).filter(p => p.length > 2)
  
  return parts.length > 0 ? parts.join(', ') : locality.trim()
}

async function geocodeLocality(
  supabase: any,
  locality: string,
  listingId: string
): Promise<{ location: GeocodedLocation; simplified?: string } | null> {
  const originalLocality = locality.trim()
  const normalizedLocality = originalLocality.toLowerCase()
  const logPrefix = `[geocode ${listingId.slice(0,8)}]`
  
  // Check cache first (try original)
  const { data: cached, error: cacheError } = await supabase
    .from('geocode_cache')
    .select('latitude, longitude, display_name')
    .ilike('locality', normalizedLocality)
    .limit(1)
    .maybeSingle()
  
  if (!cacheError && cached) {
    console.log(`${logPrefix} Cache hit for "${normalizedLocality}"`)
    return {
      location: {
        latitude: cached.latitude,
        longitude: cached.longitude,
        display_name: cached.display_name
      }
    }
  }
  
  // Simplify locality for better geocoding
  const simplifiedLocality = simplifyLocality(originalLocality)
  const wasSimplified = simplifiedLocality.toLowerCase() !== normalizedLocality
  
  // Check cache for simplified version too
  if (wasSimplified) {
    const { data: simplifiedCached } = await supabase
      .from('geocode_cache')
      .select('latitude, longitude, display_name')
      .ilike('locality', simplifiedLocality.toLowerCase())
      .limit(1)
      .maybeSingle()
    
    if (simplifiedCached) {
      console.log(`${logPrefix} Cache hit (simplified) for "${simplifiedLocality}"`)
      // Cache the original locality too for future lookups
      try {
        await supabase.from('geocode_cache').insert({
          locality: normalizedLocality,
          latitude: simplifiedCached.latitude,
          longitude: simplifiedCached.longitude,
          display_name: simplifiedCached.display_name
        })
      } catch {
        // Ignore duplicate key errors
      }
      
      return {
        location: {
          latitude: simplifiedCached.latitude,
          longitude: simplifiedCached.longitude,
          display_name: simplifiedCached.display_name
        },
        simplified: simplifiedLocality
      }
    }
  }
  
  // Try geocoding with progressively simpler search queries
  const searchLocality = wasSimplified ? simplifiedLocality : originalLocality
  const parts = searchLocality.split(',').map(p => p.trim()).filter(p => p.length > 2)
  
  // Build search variations: full string first, then progressively simpler
  const searchVariations: string[] = []
  
  // Try full simplified string first
  searchVariations.push(searchLocality)
  
  // If multiple parts, try just the first part (main locality) + district
  if (parts.length >= 2) {
    searchVariations.push(`${parts[0]}, ${parts[parts.length - 1]}`)
  }
  
  // Try just the main locality part
  if (parts.length >= 1) {
    searchVariations.push(parts[0])
  }
  
  for (const searchTerm of searchVariations) {
    const searchQuery = `${searchTerm}, Karnataka, India`
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?` +
      `q=${encodeURIComponent(searchQuery)}` +
      `&format=json&limit=1&countrycodes=in`
    
    console.log(`${logPrefix} Trying: "${searchQuery}"`)
    
    try {
      const response = await fetch(nominatimUrl, {
        headers: { 'User-Agent': 'UdupiPropertyTracker/1.0 (property listing aggregator)' }
      })
      
      if (!response.ok) {
        console.log(`${logPrefix} HTTP error for "${searchTerm}": ${response.status}`)
        continue
      }
      
      const results = await response.json()
      if (!results || results.length === 0) {
        console.log(`${logPrefix} No results for "${searchTerm}"`)
        continue
      }
      
      const result = results[0]
      const latitude = parseFloat(result.lat)
      const longitude = parseFloat(result.lon)
      const display_name = result.display_name
      
      console.log(`${logPrefix} SUCCESS with "${searchTerm}": ${latitude.toFixed(4)}, ${longitude.toFixed(4)} - returning result`)
      
      // Cache the result with original locality (ignore duplicate key errors)
      try {
        await supabase.from('geocode_cache').insert({
          locality: normalizedLocality,
          latitude,
          longitude,
          display_name
        })
      } catch {
        // Ignore cache insert errors (likely duplicate key)
      }
      
      return { 
        location: { latitude, longitude, display_name },
        simplified: searchTerm !== originalLocality ? searchTerm : undefined
      }
    } catch (err) {
      console.log(`${logPrefix} Error for "${searchTerm}": ${err}`)
      continue
    }
  }
  
  // All variations failed
  console.log(`${logPrefix} ALL FAILED for "${originalLocality}"`)
  return null
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
          
          const result = await geocodeLocality(supabase, listing.locality, listing.id)
          
          if (result) {
            const { location, simplified } = result
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
              const simplifiedNote = simplified ? ` (simplified: ${simplified})` : ''
              sendLog('success', `✓ Geocoded ${listing.locality}${simplifiedNote}`, `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`)
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
    const result = await geocodeLocality(supabase, listing.locality, listing.id)
    
    if (result) {
      const { location } = result
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
