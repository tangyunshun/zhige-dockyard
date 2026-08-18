export interface SessionInfo {
  userId: string;
  expiresAt: Date;
}

const globalForSession = global as unknown as {
  sessionCache: Map<string, SessionInfo>;
};

export const sessionCache = globalForSession.sessionCache || new Map<string, SessionInfo>();

if (process.env.NODE_ENV !== "production") {
  globalForSession.sessionCache = sessionCache;
}
