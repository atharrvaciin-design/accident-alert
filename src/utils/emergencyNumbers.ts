export interface EmergencyServiceContact {
  id: string;
  name: string;
  category: 'All Emergency' | 'Ambulance' | 'Police' | 'Fire' | 'Highway Patrol' | 'Medical Helpline';
  number: string;
  description: string;
  badge?: string;
  isNational?: boolean;
}

export interface RegionEmergencyData {
  countryCode: string;
  countryName: string;
  primaryEmergency: string;
  services: EmergencyServiceContact[];
}

const EMERGENCY_DATABASE: Record<string, RegionEmergencyData> = {
  us: {
    countryCode: 'US',
    countryName: 'United States',
    primaryEmergency: '911',
    services: [
      {
        id: 'us-all',
        name: '911 Universal Emergency',
        category: 'All Emergency',
        number: '911',
        description: 'Direct link to local 911 police, fire & EMS dispatchers',
        badge: 'Top Priority',
        isNational: true,
      },
      {
        id: 'us-ems',
        name: 'Ambulance & Paramedics',
        category: 'Ambulance',
        number: '911',
        description: 'Emergency medical services & rapid triage ambulance dispatch',
        badge: 'Life Threatening',
      },
      {
        id: 'us-police',
        name: 'Police / Highway Patrol',
        category: 'Police',
        number: '911',
        description: 'Traffic collision reporting, traffic control & scene securing',
      },
      {
        id: 'us-fire',
        name: 'Fire & Rescue Extrication',
        category: 'Fire',
        number: '911',
        description: 'Vehicle extrication, heavy fire, and hazardous fluid containment',
      },
      {
        id: 'us-highway',
        name: 'State Highway Roadside Assistance',
        category: 'Highway Patrol',
        number: '511',
        description: 'Freeway towing, obstruction clearing & roadside emergency service',
      },
    ],
  },
  ca: {
    countryCode: 'CA',
    countryName: 'Canada',
    primaryEmergency: '911',
    services: [
      {
        id: 'ca-all',
        name: '911 Central Emergency',
        category: 'All Emergency',
        number: '911',
        description: 'Canadian national emergency response for ambulance, police & fire',
        badge: 'Top Priority',
        isNational: true,
      },
      {
        id: 'ca-ambulance',
        name: 'Paramedic Ambulance Service',
        category: 'Ambulance',
        number: '911',
        description: 'Immediate trauma and emergency hospital transport',
      },
      {
        id: 'ca-highway',
        name: 'Provincial Roadway Safety (511)',
        category: 'Highway Patrol',
        number: '511',
        description: 'Highway condition reports and accident clearance',
      },
    ],
  },
  in: {
    countryCode: 'IN',
    countryName: 'India',
    primaryEmergency: '112',
    services: [
      {
        id: 'in-all',
        name: '112 National Emergency (ERSS)',
        category: 'All Emergency',
        number: '112',
        description: 'Unified Emergency Response Support System across India',
        badge: 'Top Priority',
        isNational: true,
      },
      {
        id: 'in-ambulance',
        name: '108 / 102 Ambulance & EMS',
        category: 'Ambulance',
        number: '108',
        description: 'Free emergency medical transport & accident trauma response',
        badge: 'Medical Priority',
      },
      {
        id: 'in-police',
        name: '100 Police Control Room',
        category: 'Police',
        number: '100',
        description: 'Traffic police & emergency law enforcement response',
      },
      {
        id: 'in-highway',
        name: '1033 National Highway Helpline',
        category: 'Highway Patrol',
        number: '1033',
        description: 'NHAI highway crane, towing and emergency medical aid',
        badge: 'Roadway Help',
      },
      {
        id: 'in-fire',
        name: '101 Fire & Rescue Brigade',
        category: 'Fire',
        number: '101',
        description: 'Vehicle fire extinguishing and trapped passenger rescue',
      },
    ],
  },
  gb: {
    countryCode: 'GB',
    countryName: 'United Kingdom',
    primaryEmergency: '999',
    services: [
      {
        id: 'gb-all',
        name: '999 Emergency Services',
        category: 'All Emergency',
        number: '999',
        description: 'UK primary emergency line for Ambulance, Police, and Fire',
        badge: 'Top Priority',
        isNational: true,
      },
      {
        id: 'gb-nhs',
        name: '111 NHS Urgent Medical Advice',
        category: 'Medical Helpline',
        number: '111',
        description: 'Urgent medical guidance when not immediately life-threatening',
      },
      {
        id: 'gb-highways',
        name: 'National Highways Emergency',
        category: 'Highway Patrol',
        number: '03001235000',
        description: 'Motorway and A-road incident management and lane clearance',
      },
    ],
  },
  au: {
    countryCode: 'AU',
    countryName: 'Australia',
    primaryEmergency: '000',
    services: [
      {
        id: 'au-all',
        name: '000 Triple Zero',
        category: 'All Emergency',
        number: '000',
        description: 'Australia national emergency dispatch for Police, Fire, and Ambulance',
        badge: 'Top Priority',
        isNational: true,
      },
      {
        id: 'au-ses',
        name: '132 500 State Emergency Service (SES)',
        category: 'Highway Patrol',
        number: '132500',
        description: 'Severe weather, road hazards & structural rescue',
      },
    ],
  },
  de: {
    countryCode: 'DE',
    countryName: 'Germany',
    primaryEmergency: '112',
    services: [
      {
        id: 'de-ems',
        name: '112 Rettungsdienst & Feuerwehr',
        category: 'Ambulance',
        number: '112',
        description: 'Medical emergencies, paramedics and fire rescue across Germany/EU',
        badge: 'Top Priority',
        isNational: true,
      },
      {
        id: 'de-police',
        name: '110 Polizei Notruf',
        category: 'Police',
        number: '110',
        description: 'Police emergency call for accidents and roadway dangers',
      },
    ],
  },
  fr: {
    countryCode: 'FR',
    countryName: 'France',
    primaryEmergency: '112',
    services: [
      {
        id: 'fr-all',
        name: '112 Numéro d\'urgence Européen',
        category: 'All Emergency',
        number: '112',
        description: 'Universal European emergency response in France',
        badge: 'Top Priority',
        isNational: true,
      },
      {
        id: 'fr-samu',
        name: '15 SAMU Ambulance d\'Urgence',
        category: 'Ambulance',
        number: '15',
        description: 'Urgent medical aid and physician-staffed mobile ambulances',
      },
      {
        id: 'fr-police',
        name: '17 Police Secours',
        category: 'Police',
        number: '17',
        description: 'Police and gendarmerie emergency assistance',
      },
      {
        id: 'fr-fire',
        name: '18 Sapeurs-Pompiers',
        category: 'Fire',
        number: '18',
        description: 'Accident rescue, vehicle fires, and trapped victims',
      },
    ],
  },
};

// Fallback international universal standard
const GLOBAL_FALLBACK: RegionEmergencyData = {
  countryCode: 'GLOBAL',
  countryName: 'International / Universal',
  primaryEmergency: '112',
  services: [
    {
      id: 'global-112',
      name: '112 Universal GSM Emergency',
      category: 'All Emergency',
      number: '112',
      description: 'Standard GSM emergency number routed to local dispatch internationally',
      badge: 'Universal SOS',
      isNational: true,
    },
    {
      id: 'global-911',
      name: '911 Emergency Standard',
      category: 'Ambulance',
      number: '911',
      description: 'Standard emergency dispatch recognized across North America and satellites',
      badge: 'Rapid Dispatch',
    },
    {
      id: 'global-police',
      name: 'Local Emergency Police',
      category: 'Police',
      number: '112',
      description: 'Direct emergency police dispatch for accident scene safety',
    },
    {
      id: 'global-fire',
      name: 'Fire & Extrication Rescue',
      category: 'Fire',
      number: '112',
      description: 'Emergency vehicle extraction, chemical leak and fire brigade',
    },
  ],
};

/**
 * Resolves local emergency services based on detected country code (e.g. 'us', 'in', 'ca')
 */
export function getEmergencyServicesByCountry(countryCode?: string): RegionEmergencyData {
  if (!countryCode) return EMERGENCY_DATABASE.us; // Default to US if not detected yet
  const code = countryCode.toLowerCase().trim();
  return EMERGENCY_DATABASE[code] || GLOBAL_FALLBACK;
}

/**
 * Local custom emergency contacts management (e.g., family member, personal doctor)
 */
export interface CustomContact {
  id: string;
  name: string;
  number: string;
  relationship: string;
}

export function getCustomContacts(): CustomContact[] {
  try {
    const raw = localStorage.getItem('accident_alert_custom_contacts');
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // fallback
  }
  return [];
}

export function saveCustomContact(contact: Omit<CustomContact, 'id'>): CustomContact[] {
  const current = getCustomContacts();
  const newContact: CustomContact = {
    ...contact,
    id: `custom_${Date.now()}`,
  };
  const updated = [newContact, ...current];
  localStorage.setItem('accident_alert_custom_contacts', JSON.stringify(updated));
  return updated;
}

export function deleteCustomContact(id: string): CustomContact[] {
  const current = getCustomContacts();
  const updated = current.filter((c) => c.id !== id);
  localStorage.setItem('accident_alert_custom_contacts', JSON.stringify(updated));
  return updated;
}
