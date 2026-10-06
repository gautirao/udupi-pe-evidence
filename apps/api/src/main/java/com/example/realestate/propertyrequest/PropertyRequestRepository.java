package com.example.realestate.propertyrequest;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface PropertyRequestRepository extends JpaRepository<PropertyRequest, UUID> {

    List<PropertyRequest> findAllByOrderByCreatedAtDesc(Pageable pageable);
}
