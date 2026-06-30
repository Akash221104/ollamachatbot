package com.example.proxy.controller;

import com.example.proxy.dto.ChatRequest;
import com.example.proxy.service.UserExternalIdMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.reactive.function.client.WebClient;
import jakarta.servlet.http.HttpServletResponse;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/widget")
public class ChatbotController {

    @Value("${chatbot.nextjs-url}")
    private String nextJsUrl;

    @Value("${chatbot.api-key}")
    private String apiKey;

    private final UserExternalIdMapper userExternalIdMapper;
    private final WebClient webClient;

    public ChatbotController(UserExternalIdMapper userExternalIdMapper, WebClient.Builder webClientBuilder) {
        this.userExternalIdMapper = userExternalIdMapper;
        this.webClient = webClientBuilder.build();
    }

    // Support CORS for local development environments if needed
    @CrossOrigin
    @PostMapping("/chat")
    public void proxyChat(@RequestBody ChatRequest chatRequest, Authentication authentication, HttpServletResponse response) {
        response.setContentType("text/event-stream");
        response.setCharacterEncoding("UTF-8");
        response.setHeader("Cache-Control", "no-cache");
        response.setHeader("Connection", "keep-alive");

        if (chatRequest == null || chatRequest.getMessage() == null || chatRequest.getMessage().trim().isEmpty()) {
            writeError(response, "Message required");
            return;
        }

        if (authentication == null || !authentication.isAuthenticated()) {
            writeError(response, "Unauthorized");
            return;
        }

        String username = authentication.getName();
        String externalUserId = userExternalIdMapper.getExternalId(username);

        // Build the payload securely on the backend
        Map<String, String> payload = new HashMap<>();
        payload.put("apiKey", apiKey);
        payload.put("userId", externalUserId); // Using the mapped external ID (e.g. "101" or "102")
        payload.put("userName", username);
        payload.put("message", chatRequest.getMessage());

        String targetUrl = nextJsUrl + "/api/widget/chat";

        try {
            webClient.post()
                    .uri(targetUrl)
                    .contentType(MediaType.APPLICATION_JSON)
                    .accept(MediaType.TEXT_EVENT_STREAM)
                    .bodyValue(payload)
                    .retrieve()
                    .bodyToFlux(String.class)
                    .doOnNext(chunk -> {
                        try {
                            String sseChunk = "data: " + chunk + "\n\n";
                            response.getOutputStream().write(sseChunk.getBytes());
                            response.getOutputStream().flush();
                        } catch (Exception e) {
                            // Client disconnected or stream closed
                        }
                    })
                    .doOnError(err -> writeError(response, "The chatbot service is temporarily unavailable. Please try again later."))
                    .timeout(Duration.ofSeconds(30))
                    .blockLast(); // Block Tomcat thread until streaming completes
        } catch (Exception e) {
            // Request completed or connection closed
        }
    }

    private void writeError(HttpServletResponse response, String errMsg) {
        try {
            String payload = "data: {\"chunk\": \"" + errMsg + "\", \"done\": true}\n\n";
            response.getOutputStream().write(payload.getBytes());
            response.getOutputStream().flush();
        } catch (Exception e) {}
    }
}
