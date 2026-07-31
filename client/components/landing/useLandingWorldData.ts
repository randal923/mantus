"use client";

import {
  publicLandingDataSchema,
  type PublicLandingData,
} from "@tibia/protocol";
import {
  type PublicDataState,
  usePublicApiData,
} from "../../hooks/usePublicApiData";

export function useLandingWorldData(): PublicDataState<PublicLandingData> {
  return usePublicApiData("/api/public/landing", publicLandingDataSchema);
}
