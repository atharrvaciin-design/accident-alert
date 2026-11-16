export type ReportStatus = 'Pending' | 'In Progress' | 'Resolved';
export type PriorityLevel = 'Low' | 'Medium' | 'High' | 'Critical';

export type AccidentCategory =
  | 'Vehicle'
  | 'Pedestrian'
  | 'Infrastructure'
  | 'Multiple'
  | 'Other';

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  relationship: string;
  enabled: boolean;
  whatsappEnabled?: boolean;
}

export interface SmsDispatchRecord {
  id: string;
  contactName: string;
  phone: string;
  message: string;
  timestamp: string;
  status: 'Sent' | 'Delivered' | 'Simulated';
}

export interface WhatsappDispatchRecord {
  id: string;
  contactName: string;
  phone: string;
  message: string;
  photoIncluded: boolean;
  photoPublicUrl?: string;
  whatsappUri?: string;
  gatewayProvider: 'twilio-whatsapp' | 'meta-whatsapp' | 'whatsapp-sandbox';
  gatewaySid?: string;
  status: 'Queued' | 'Sent' | 'Delivered' | 'Simulated' | 'Failed';
  errorMessage?: string;
  timestamp: string;
}

export interface EmergencyDispatcher {
  id: string;
  name: string;
  unitCode: string;
  role: 'EMS Lead' | 'Fire & Rescue' | 'Highway Patrol' | 'Trauma Unit';
  phone: string;
  latitude: number;
  longitude: number;
  stationName: string;
  maxRadiusKm: number;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface DispatcherSmsAlert {
  id: string;
  reportDocId: string;
  reportId: string;
  priority: PriorityLevel;
  dispatcherId: string;
  dispatcherName: string;
  unitCode: string;
  dispatcherPhone: string;
  distanceKm: number;
  withinRadius: boolean;
  message: string;
  gatewayProvider: 'twilio' | 'twilio-sandbox';
  gatewaySid?: string;
  status: 'queued' | 'sent' | 'delivered' | 'simulated' | 'failed';
  errorMessage?: string;
  createdAt: string;
}

export interface AdminNote {
  id: string;
  author: string;
  note: string;
  timestamp: string;
}

export interface WeatherHazardInfo {
  tempC: number;
  weatherCode: number;
  conditionText: string;
  windKph: number;
  humidity: number;
  precipitationMm: number;
  isHazardous: boolean;
  hazardReason?: string;
}

export interface AIAnalysisResult {
  isVehicleAccident: boolean;
  vehicleDamage: string;
  hazardsDetected: string;
  description: string;
  suggestedPriority: PriorityLevel;
  priorityReason: string;
  aiSummary: string;
  criticalHazardBadge?: string;
  safetyDisclaimer?: string;
}

export interface SenderInfo {
  name?: string;
  phone?: string;
  email?: string;
}

export interface AccidentReport {
  id: string;
  reportId: string;
  photoUrl: string;
  latitude: number;
  longitude: number;
  address: string;
  googleMapsUrl: string;
  emergencyMessage: string;
  quickMessageType: string;
  category?: AccidentCategory;
  status: ReportStatus;
  priority: PriorityLevel;
  priorityReason: string;
  aiAnalysis?: AIAnalysisResult;
  senderInfo?: SenderInfo;
  createdAt: string;
  updatedAt: string;
  notes?: string;
  internalNotes?: string;
  adminNotesList?: AdminNote[];
  responderStatus?: 'Unassigned' | 'Dispatched' | 'En Route' | 'On Scene';
  responderEtaMinutes?: number;
  responderDistanceKm?: number;
  smsDispatches?: SmsDispatchRecord[];
  whatsappDispatches?: WhatsappDispatchRecord[];
  weather?: WeatherHazardInfo;
  dispatcherSmsCount?: number;
  lastDispatcherSmsAt?: string;
  voiceMessageUrl?: string;
  voiceMessageDurationSec?: number;
  voiceTranscript?: string;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
  accuracy?: number;
}
