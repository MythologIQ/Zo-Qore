/**
 * Planning Contracts - Void View
 * 
 * Void is the raw creative capture interface.
 * Thoughts are the atomic unit of the planning pipeline.
 */

/**
 * A captured thought in the Void view.
 * Raw creative input that may originate from text or voice.
 */
export interface VoidThought {
  /** Unique identifier (UUID) */
  thoughtId: string;
  
  /** Project this thought belongs to */
  projectId: string;
  
  /** Raw thought content (may originate from STT) */
  content: string;
  
  /** How the thought was captured */
  source: 'text' | 'voice';
  
  /** ISO 8601 timestamp of capture */
  capturedAt: string;
  
  /** Actor who captured this thought */
  capturedBy: string;
  
  /** Optional freeform tags for categorization */
  tags: string[];
  
  /** Whether this thought has been claimed by a cluster */
  status: 'raw' | 'claimed';
}

/**
 * Request to create a new thought
 */
export interface CreateThoughtRequest {
  projectId: string;
  content: string;
  source: 'text' | 'voice';
  capturedBy: string;
  tags?: string[];
}

/**
 * Request to update a thought
 */
export interface UpdateThoughtRequest {
  thoughtId: string;
  tags?: string[];
  status?: 'raw' | 'claimed';
}

/**
 * Filter options for listing thoughts
 */
export interface ListThoughtsFilter {
  projectId: string;
  status?: 'raw' | 'claimed';
  tags?: string[];
  source?: 'text' | 'voice';
  capturedBy?: string;
  since?: string;
  until?: string;
}
