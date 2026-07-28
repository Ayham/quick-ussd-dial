/**
 * Marketing & App Config
 * إدارة الباقات والتحديثات والروابط
 */

export interface AppRelease {
  id: string;
  version: string;
  downloadUrl: string;
  changelog: string;
  releaseDate: string;
  isLatest: boolean;
}
