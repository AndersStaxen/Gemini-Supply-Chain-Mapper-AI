
export interface StockItem {
  ticker: string;
  shares: number;
  price: number;
  companyName: string;
  marketCap: string;
}

export interface MapMarker {
  id: string;
  title: string;
  type: 'HQ' | 'Factory' | 'Supplier' | 'Customer';
  lat: number;
  lng: number;
  description: string;
  uri?: string;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface AnalysisResult {
  ticker: string;
  content: string;
  sources: GroundingSource[];
  price?: number;
  marketCap?: string;
  domain?: string;
}