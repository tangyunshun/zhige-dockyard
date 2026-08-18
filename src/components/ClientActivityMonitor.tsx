"use client";

import { useEffect, useState } from "react";
import ActivityMonitor from "./ActivityMonitor";

export default function ClientActivityMonitor() {
  const [hasUser, setHasUser] = useState(false);

  useEffect(() => {
    const userId = localStorage.getItem("userId");
    if (userId) {
      setHasUser(true);
    }
  }, []);

  if (!hasUser) return null;
  return <ActivityMonitor />;
}
