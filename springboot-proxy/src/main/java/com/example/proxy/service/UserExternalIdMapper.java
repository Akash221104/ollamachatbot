package com.example.proxy.service;

import org.springframework.stereotype.Component;
import java.util.HashMap;
import java.util.Map;

@Component
public class UserExternalIdMapper {
    private final Map<String, String> userMap = new HashMap<>();

    public UserExternalIdMapper() {
        // Map in-memory Spring Security usernames to Next.js RAG DB users.external_id values
        userMap.put("akash", "101");
        userMap.put("rahul", "102");
    }

    public String getExternalId(String username) {
        return userMap.getOrDefault(username.toLowerCase(), "unknown");
    }
}
