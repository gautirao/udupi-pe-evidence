package com.example.realestate.discover.navigation;

import java.util.List;

/** One of a city's primary directional regions, plus its member canonical areas. */
public record GeneratorRegionInput(String regionKey, List<GeneratorArea> members) {
}
