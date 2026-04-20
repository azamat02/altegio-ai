export interface AltegioAuthContext {
  partnerToken: string;
  userToken?: string;
  locationId: number;
}

export interface AltegioPaginatedResponse<T> {
  success: boolean;
  data: T[];
  meta?: {
    total_count?: number;
  };
}
