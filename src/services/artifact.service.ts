import { createHash } from 'crypto';
import { queryOne } from '../db';
import { Artifact } from '../types';

const MAX_PROMPT_FILES_CHARS = 60_000;

/**
 * Artifact Service
 * Persists generated source file maps so versions, edits, SEO, and builds
 * all operate on real stored code instead of placeholders.
 */
export class ArtifactService {
  /**
   * Create an artifact from a file map
   */
  static async createArtifact(params: {
    websiteId: string;
    files: Record<string, string>;
    userId: string;
    type?: 'source' | 'build' | 'seo';
    metadata?: Record<string, unknown>;
  }): Promise<Artifact> {
    const serialized = JSON.stringify(params.files);
    const checksum = createHash('sha256').update(serialized).digest('hex');
    const sizeBytes = Buffer.byteLength(serialized, 'utf8');

    const artifact = await queryOne<Artifact>(
      `INSERT INTO artifacts (website_id, type, files, checksum, size_bytes, metadata, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        params.websiteId,
        params.type || 'source',
        JSON.stringify(params.files),
        checksum,
        sizeBytes,
        JSON.stringify(params.metadata || {}),
        params.userId,
      ]
    );

    return artifact!;
  }

  /**
   * Get the latest artifact for a website
   */
  static async getLatestArtifact(websiteId: string): Promise<Artifact | null> {
    return queryOne<Artifact>(
      'SELECT * FROM artifacts WHERE website_id = $1 ORDER BY created_at DESC LIMIT 1',
      [websiteId]
    );
  }

  /**
   * Get artifact by ID
   */
  static async getArtifactById(id: string): Promise<Artifact | null> {
    return queryOne<Artifact>('SELECT * FROM artifacts WHERE id = $1', [id]);
  }

  /**
   * Get artifact referenced by a website version
   */
  static async getArtifactForVersion(versionId: string): Promise<Artifact | null> {
    const version = await queryOne<{ source_artifact_id?: string }>(
      'SELECT source_artifact_id FROM website_versions WHERE id = $1',
      [versionId]
    );

    if (!version?.source_artifact_id) return null;
    return this.getArtifactById(version.source_artifact_id);
  }

  /**
   * Serialize a file map into prompt-friendly text, bounded by size.
   * Files are included in path order; if the total exceeds the limit,
   * remaining files are listed by path only.
   */
  static serializeFilesForPrompt(files: Record<string, string>): string {
    const paths = Object.keys(files).sort();
    const sections: string[] = [];
    let used = 0;
    const omitted: string[] = [];

    for (const path of paths) {
      const block = `### ${path}\n\`\`\`\n${files[path]}\n\`\`\`\n`;
      if (used + block.length > MAX_PROMPT_FILES_CHARS) {
        omitted.push(path);
        continue;
      }
      sections.push(block);
      used += block.length;
    }

    let output = sections.join('\n');
    if (omitted.length > 0) {
      output += `\n### Additional files (content omitted due to size):\n${omitted.map(p => `- ${p}`).join('\n')}`;
    }

    return output;
  }
}
