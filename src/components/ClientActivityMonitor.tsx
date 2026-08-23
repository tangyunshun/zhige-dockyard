"use client";

import { useEffect, useState } from "react";
import ActivityMonitor from "./ActivityMonitor";
import { getAuthToken } from "@/utils/auth";

export default function ClientActivityMonitor() {
  const [hasUser, setHasUser] = useState(false);

  useEffect(() => {
    if (getAuthToken()) {
      setHasUser(true);
    }
  }, []);

  if (!hasUser) return null;
  return <ActivityMonitor />;
}
