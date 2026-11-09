# 3D engine model attribution and use

## Selected engine

- **Engine represented:** the Wright brothers’ 1903 Flyer four-cylinder gasoline aero piston engine (the engine mesh from the 1903 Wright Flyer scan).
- **Manufacturer / design:** Wright brothers / Wright Cycle Company, Dayton, Ohio; the engine was built with their mechanic and engine builder, Charles Taylor.
- **Why selected:** it is a real aircraft piston-engine design with a detailed, locally usable PBR scan, an unambiguous public-domain licence, a downloadable Draco-compressed GLB, and a size suitable for a student laptop.

## 3D model source

- **Model source and publisher:** Smithsonian 3D Digitization, Smithsonian Institution / National Air and Space Museum.
- **Model creator:** Smithsonian Institution Digitization Program Office; the public catalogue does not credit an individual scanner.
- **Collection item:** [1903 Wright Flyer](https://www.si.edu/object/3d/d8c62e5e-4ebc-11ea-b77f-2e728ce88125), engine mesh.
- **Downloaded file source:** [wright_flyer_engine_mesh-53k-2048-medium.glb](https://cdn.3d-api.si.edu/d8c62e5e-4ebc-11ea-b77f-2e728ce88125/wright_flyer_engine_mesh-53k-2048-medium.glb).
- **Local project path:** `frontend/public/models/wright-flyer-engine.glb`.
- **Asset characteristics:** 53k mesh profile, 2048 textures, Draco-compressed GLB. The original model is kept locally, so the website makes no runtime request to an external 3D viewer or model host.

## Licence and redistribution

- **Licence:** Creative Commons Zero / public domain (CC0), as designated by the Smithsonian Open Access programme for this 3D asset.
- **Attribution requirement:** CC0 does not require attribution. The Smithsonian asks users to provide useful basic credit where practical; AeroTwin displays this credit in the About page and preserves it here.
- **Commercial and educational redistribution:** permitted. CC0 allows copying, modification, distribution, and reuse without asking the Smithsonian. The project may embed and redistribute the downloaded model.
- **Suggested credit:** “1903 Wright Flyer engine mesh, Smithsonian Institution / National Air and Space Museum, Smithsonian 3D Digitization, CC0.”

## Important representation limitation

This is a historically accurate, real-world aero piston-engine scan, rather than a current MALE-UAV powerplant. It was chosen because no comparably detailed modern Rotax, Lycoming, or Continental GLB with equally clear, no-cost redistribution rights was available during implementation. AeroTwin’s telemetry, health, and fault state remain explicitly synthetic. The component anchors (cooling, lubrication, fuel, combustion, mechanical, and sensors) are digital-twin inspection mappings on the scanned geometry; they do not claim that the 1903 engine carried modern sensors or had the exact subsystem layout of a modern UAV engine.

## Mapping approach

The scan is a dense photogrammetry mesh rather than a semantic CAD assembly. The viewer calculates each inspection anchor from the loaded model’s runtime bounding box, preserving 3D-world-space attachment through camera movement, zoom, panning, and fullscreen mode. This is documented so an evaluator can distinguish the authentic source geometry from the application’s live condition-overlay mapping.
