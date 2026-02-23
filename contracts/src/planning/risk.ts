/**
 * Planning Contracts - Risk View
 * 
 * Risk is the assessment register interface.
 * Tracks risks associated with execution phases.
 */

/**
 * A risk entry in the Risk view.
 * Documents potential issues and mitigations.
 */
export interface RiskEntry {
  /** Unique identifier (UUID) */
  riskId: string;
  
  /** Project this risk belongs to */
  projectId: string;
  
  /** Which phase this risk applies to */
  phaseId: string;
  
  /** Risk description */
  description: string;
  
  /** Likelihood of occurrence */
  likelihood: 'low' | 'medium' | 'high';
  
  /** Impact if realized */
  impact: 'low' | 'medium' | 'high';
  
  /** Mitigation strategy */
  mitigation: string;
  
  /** Actor responsible for this risk */
  owner: string;
  
  /** Current risk status */
  status: 'identified' | 'mitigated' | 'accepted' | 'realized';
  
  /** ISO 8601 timestamp of creation */
  createdAt: string;
  
  /** ISO 8601 timestamp of last update */
  updatedAt: string;
}

/**
 * Request to create a risk entry
 */
export interface CreateRiskRequest {
  projectId: string;
  phaseId: string;
  description: string;
  likelihood: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  mitigation: string;
  owner: string;
}

/**
 * Request to update a risk entry
 */
export interface UpdateRiskRequest {
  riskId: string;
  description?: string;
  likelihood?: 'low' | 'medium' | 'high';
  impact?: 'low' | 'medium' | 'high';
  mitigation?: string;
  status?: 'identified' | 'mitigated' | 'accepted' | 'realized';
}

/**
 * Filter options for listing risks
 */
export interface ListRisksFilter {
  projectId: string;
  phaseId?: string;
  status?: 'identified' | 'mitigated' | 'accepted' | 'realized';
  minLikelihood?: 'low' | 'medium' | 'high';
  minImpact?: 'low' | 'medium' | 'high';
}

/**
 * Risk matrix for visualizing risk distribution
 */
export interface RiskMatrix {
  lowLikelihoodLowImpact: RiskEntry[];
  lowLikelihoodMediumImpact: RiskEntry[];
  lowLikelihoodHighImpact: RiskEntry[];
  mediumLikelihoodLowImpact: RiskEntry[];
  mediumLikelihoodMediumImpact: RiskEntry[];
  mediumLikelihoodHighImpact: RiskEntry[];
  highLikelihoodLowImpact: RiskEntry[];
  highLikelihoodMediumImpact: RiskEntry[];
  highLikelihoodHighImpact: RiskEntry[];
}
