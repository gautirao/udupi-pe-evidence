package com.example.realestate.discover.citylaunch;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

@Service
public class CityLaunchSseService {
    private static final Logger log = LoggerFactory.getLogger(CityLaunchSseService.class);

    private final Map<Integer, List<SseEmitter>> emittersByCityId = new ConcurrentHashMap<>();
    private final ObjectMapper objectMapper;
    private final CityLaunchReadService cityLaunchReadService;

    public CityLaunchSseService(ObjectMapper objectMapper, CityLaunchReadService cityLaunchReadService) {
        this.objectMapper = objectMapper;
        this.cityLaunchReadService = cityLaunchReadService;
    }

    public SseEmitter subscribe(int cityId) {
        SseEmitter emitter = new SseEmitter(0L); // No timeout
        
        emittersByCityId.computeIfAbsent(cityId, k -> new CopyOnWriteArrayList<>()).add(emitter);
        
        Runnable removeEmitter = () -> {
            List<SseEmitter> emitters = emittersByCityId.get(cityId);
            if (emitters != null) {
                emitters.remove(emitter);
                if (emitters.isEmpty()) {
                    emittersByCityId.remove(cityId);
                }
            }
        };

        emitter.onCompletion(removeEmitter);
        emitter.onTimeout(removeEmitter);
        emitter.onError(e -> removeEmitter.run());

        // Emit initial state
        try {
            CityLaunchProgressDto currentProgress = cityLaunchReadService.getProgress(cityId);
            emitter.send(SseEmitter.event().data(objectMapper.writeValueAsString(currentProgress)));
            
            // If already terminal, we can complete the emitter immediately
            if ("DONE".equals(currentProgress.prepState()) || "FAILED".equals(currentProgress.prepState())) {
                emitter.complete();
            }
        } catch (Exception e) {
            log.error("Failed to send initial SSE for city {}", cityId, e);
            emitter.completeWithError(e);
        }

        return emitter;
    }

    public void emitProgress(CityLaunchRevision revision) {
        int cityId = revision.getCityId();
        List<SseEmitter> emitters = emittersByCityId.get(cityId);
        if (emitters == null || emitters.isEmpty()) {
            return;
        }

        CityLaunchProgressDto dto = CityLaunchProgressDto.from(revision);

        String json;
        try {
            json = objectMapper.writeValueAsString(dto);
        } catch (IOException e) {
            log.error("Failed to serialize progress for city {}", cityId, e);
            return;
        }

        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event().data(json));
            } catch (IOException e) {
                log.debug("Removing stale SSE emitter for city {}", cityId);
                emitter.completeWithError(e);
            }
        }
        
        if (revision.getPrepState() == PrepState.DONE || revision.getPrepState() == PrepState.FAILED) {
            for (SseEmitter emitter : emitters) {
                emitter.complete();
            }
        }
    }
}
