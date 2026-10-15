/** Loads .env in development (Node 22 built-in) and exposes typed config. */
try {
  if (process.env.NODE_ENV !== "production") process.loadEnvFile(".env");
} catch {
  /* no .env file */
}

export const env = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || "development",
  jwtSecret: process.env.JWT_SECRET || "",
  webOrigins: (process.env.WEB_ORIGIN || "http://localhost:3000").split(",").map((s) => s.trim()).filter(Boolean),
  uploadDir: process.env.UPLOAD_DIR || "./uploads",
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.EMAIL_FROM || "Express Bags <no-reply@express-bags.com>",
  },
  hubspotToken: process.env.HUBSPOT_TOKEN || "",
  ipHashSalt: process.env.IP_HASH_SALT || "eb-local-salt",
};

export const isProd = env.nodeEnv === "production";
