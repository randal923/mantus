/**
 * Static fields the OpenTibia status protocol reports (config.yml `status`).
 * Absent from ServerConfig when the listener is switched off (port 0).
 */
export interface StatusConfig {
  port: number;
  /** Public address the listing points at; reported verbatim in the XML. */
  ip: string;
  serverName: string;
  location: string;
  url: string;
  ownerName: string;
  ownerEmail: string;
  motd: string;
  /** A rendered reply is reused for this long, bounding per-query work. */
  cacheMs: number;
}
