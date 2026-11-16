import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import { twilioDispatcherService } from './server/twilioDispatcherService';
import { whatsappContactService } from './server/whatsappContactService';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Support large image payloads for accident photo uploads
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));

// Server-side Gemini AI Client
const apiKey = process.env.GEMINI_API_KEY;
let aiClient: GoogleGenAI | null = null;
if (apiKey) {
  aiClient = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// AI Accident Photo Analysis Endpoint
app.post('/api/gemini/analyze-accident', async (req, res) => {
  try {
    const { photoBase64, mimeType = 'image/jpeg', locationDescription, userMessage, quickMessageType } = req.body;

    if (!photoBase64) {
      return res.status(400).json({ error: 'photoBase64 is required for AI accident analysis' });
    }

    if (!aiClient) {
      // Fallback if API key is temporarily absent
      const isSerious = userMessage?.toLowerCase().includes('serious') || quickMessageType === 'Serious Accident';
      return res.json({
        isVehicleAccident: true,
        vehicleDamage: 'Visual inspection pending (AI service initializing)',
        hazardsDetected: 'No fire or fuel hazards confirmed',
        description: 'Citizen submitted accident photo with message: ' + (userMessage || 'Emergency alert'),
        suggestedPriority: isSerious ? 'High' : 'Medium',
        priorityReason: 'Priority evaluated based on bystander urgency and reported incident profile.',
        aiSummary: `Reported emergency at ${locationDescription || 'provided GPS location'}. ${userMessage || 'Assistance requested.'}`,
        criticalHazardBadge: isSerious ? 'Severe Collision Risk' : 'Traffic Collision Alert',
        safetyDisclaimer: 'AI scene analysis only. Does not confirm biological injuries or clinical severity.',
      });
    }

    // Clean base64 string if it contains data prefix
    const cleanBase64 = photoBase64.replace(/^data:image\/[a-zA-Z0-9+]+;base64,/, '');

    const promptText = `
You are an expert emergency dispatch scene analyst assisting 911 / EMS / Traffic Control operators.
Analyze the provided photograph of a reported road/vehicle accident, together with the caller's message:
- User Message: "${userMessage || 'None provided'}"
- Quick Message Tag: "${quickMessageType || 'None'}"
- Reported Location: "${locationDescription || 'GPS coordinates provided'}"

Tasks:
1. Determine if the photo appears to depict a vehicle collision, motorcycle crash, rollover, pedestrian incident, roadside wreck, or general vehicle accident.
2. Identify any visible physical vehicle damage (e.g. crumpled bumper, windshield shattering, crushed cabin, rollover, side-impact intrusion, or minor scratch).
3. Detect any visible hazards like fire, active smoke, fluid/fuel spills on asphalt, power lines down, or road blockages.
4. Generate a concise, objective visual description (2-3 sentences max).
5. Suggest an emergency triage priority level: "High", "Medium", or "Low":
   - "High": Significant cabin intrusion, rollover, active fire/heavy smoke, multiple vehicle pile-up, highway lane blockage, or explicit high-risk bystander indicators.
   - "Medium": Moderate body damage, fender bender obstructing traffic, airbag deployed without severe cabin collapse.
   - "Low": Minor cosmetic damage, vehicle off road in safe shoulder, parking lot scrape.
6. Provide the explicit operational reason for the suggested priority.
7. Generate a concise 1-2 sentence AI emergency dispatch summary combining visual observations, location, and user message.
8. Generate a 'criticalHazardBadge': a punchy 2-4 word Quick Summary phrase highlighting the single most critical hazard or structural danger identified in the report at a glance (e.g. "Active Smoke / Fire Risk", "Fuel Leak Hazard", "Vehicle Rollover", "Road Debris Spillage", "Crushed Cabin Danger", "Highway Lane Blockage", or "Minor Collision / No Fire").

IMPORTANT MANDATE:
Do NOT claim to confirm medical injuries, fatalities, or biological condition of passengers from the photograph alone. Always maintain standard emergency dispatch objectivity.
`;

    const response = await aiClient.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: cleanBase64,
            },
          },
          {
            text: promptText,
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isVehicleAccident: {
              type: Type.BOOLEAN,
              description: 'Whether the image appears to depict a vehicle accident',
            },
            vehicleDamage: {
              type: Type.STRING,
              description: 'Visible structural or cosmetic vehicle damage detected',
            },
            hazardsDetected: {
              type: Type.STRING,
              description: 'Visible fire, smoke, hazardous fluid spill, or roadway danger detected',
            },
            description: {
              type: Type.STRING,
              description: 'Objective visual description of the accident scene',
            },
            suggestedPriority: {
              type: Type.STRING,
              enum: ['High', 'Medium', 'Low'],
              description: 'Suggested emergency response triage priority',
            },
            priorityReason: {
              type: Type.STRING,
              description: 'Operational rationale for the suggested priority',
            },
            aiSummary: {
              type: Type.STRING,
              description: 'Short synthesized dispatch summary for first responders',
            },
            criticalHazardBadge: {
              type: Type.STRING,
              description: 'Punchy 2-4 word quick summary badge highlighting the most critical hazard at a glance',
            },
          },
          required: [
            'isVehicleAccident',
            'vehicleDamage',
            'hazardsDetected',
            'description',
            'suggestedPriority',
            'priorityReason',
            'aiSummary',
            'criticalHazardBadge',
          ],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    parsed.safetyDisclaimer = 'Preliminary AI scene analysis. AI does not confirm biological injuries or clinical severity of individuals.';

    return res.json(parsed);
  } catch (error) {
    console.error('Gemini accident analysis error:', error);
    // Return a graceful structured fallback so emergency report flow is never blocked
    return res.json({
      isVehicleAccident: true,
      vehicleDamage: 'Visual damage assessment processing (telemetry received)',
      hazardsDetected: 'Inspect scene for standard fluid/electrical hazards upon arrival',
      description: 'Accident reported with photo evidence and immediate dispatch notification.',
      suggestedPriority: 'High',
      priorityReason: 'High priority assigned as emergency precaution due to reported incident.',
      aiSummary: 'Emergency alert received with live GPS coordinates and scene photograph.',
      criticalHazardBadge: 'Immediate Response Caution',
      safetyDisclaimer: 'Preliminary AI scene analysis. AI does not confirm biological injuries or clinical severity of individuals.',
    });
  }
});

// Reverse Geocoding Proxy (to resolve lat/lng into human-readable address reliably)
app.get('/api/reverse-geocode', async (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) {
    return res.status(400).json({ error: 'lat and lon are required' });
  }

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'AccidentAlertEmergencyApp/1.0',
        'Accept-Language': 'en',
      },
    });

    if (response.ok) {
      const data = await response.json();
      const displayName = data.display_name || `${lat}, ${lon}`;
      return res.json({ address: displayName, details: data.address });
    } else {
      return res.json({ address: `Coordinates: ${lat}, ${lon}` });
    }
  } catch (err) {
    console.error('Reverse geocode error:', err);
    return res.json({ address: `Near GPS (${lat}, ${lon})` });
  }
});

// Twilio SMS Gateway Status & Nearby Dispatcher Alert Endpoints
app.get('/api/dispatch/twilio-status', async (_req, res) => {
  try {
    const dispatchers = await twilioDispatcherService.ensureDefaultDispatchers();
    return res.json({
      ...twilioDispatcherService.getStatus(),
      activeDispatchersCount: dispatchers.filter((d) => d.active).length,
      totalDispatchersCount: dispatchers.length,
    });
  } catch (err) {
    console.error('Twilio status error:', err);
    return res.status(500).json({ error: 'Unable to check Twilio dispatcher gateway status' });
  }
});

app.post('/api/dispatch/critical-sms', async (req, res) => {
  try {
    const { report, force = false } = req.body || {};
    if (!report || !report.reportId || typeof report.latitude !== 'number' || typeof report.longitude !== 'number') {
      return res.status(400).json({ error: 'Valid accident report payload with coordinates is required' });
    }

    const result = await twilioDispatcherService.dispatchCriticalAlertsForReport(report, { force: Boolean(force) });
    return res.json({
      success: true,
      ...result,
      gateway: twilioDispatcherService.getStatus(),
    });
  } catch (err) {
    console.error('Critical SMS dispatch error:', err);
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to dispatch Twilio alerts',
    });
  }
});

app.post('/api/dispatch/test-twilio', async (req, res) => {
  try {
    const { latitude = 37.7749, longitude = -122.4194, address = 'Central Expressway Sector (Gateway Test)' } = req.body || {};
    const testReport = {
      id: `test_${Date.now()}`,
      reportId: `ACC-TEST-${Math.floor(1000 + Math.random() * 9000)}`,
      photoUrl: '',
      latitude: Number(latitude),
      longitude: Number(longitude),
      address: String(address),
      googleMapsUrl: `https://www.google.com/maps?q=${latitude},${longitude}`,
      emergencyMessage: 'Twilio Gateway verification test for nearby Critical accident dispatchers.',
      quickMessageType: 'Critical Emergency Test',
      category: 'Vehicle' as const,
      status: 'Pending' as const,
      priority: 'Critical' as const,
      priorityReason: 'Dispatcher gateway connectivity test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = await twilioDispatcherService.dispatchCriticalAlertsForReport(testReport, { force: true });
    return res.json({
      success: true,
      ...result,
      gateway: twilioDispatcherService.getStatus(),
    });
  } catch (err) {
    console.error('Test Twilio alert error:', err);
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Test Twilio dispatch failed',
    });
  }
});

app.get('/api/dispatch/alerts', (_req, res) => {
  return res.json({
    alerts: twilioDispatcherService.getRecentAlerts(),
    gateway: twilioDispatcherService.getStatus(),
  });
});

// Public Image Endpoint for WhatsApp MediaUrl Attachment
app.get('/api/media/report-photo/:reportKey', async (req, res) => {
  try {
    const { reportKey } = req.params;
    const media = await whatsappContactService.getPhotoBinary(reportKey);
    if (!media) {
      return res.status(404).send('Report photo not found');
    }
    res.setHeader('Content-Type', media.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.send(media.buffer);
  } catch (err) {
    console.error('Serve report photo error:', err);
    return res.status(500).send('Unable to load report photo');
  }
});

// WhatsApp Contact Photo Gateway Status
app.get('/api/dispatch/whatsapp-status', (_req, res) => {
  return res.json(whatsappContactService.getGatewayStatus());
});

// Automatic WhatsApp Photo & GPS Alert Dispatch to Emergency Contacts
app.post('/api/dispatch/whatsapp-contacts', async (req, res) => {
  try {
    const { report, contacts = [] } = req.body || {};
    if (!report || !report.reportId) {
      return res.status(400).json({ success: false, error: 'Valid accident report payload is required' });
    }

    const forwardedProto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim();
    const proto = forwardedProto || req.protocol || 'https';
    const host = req.get('host');
    const inferredBaseUrl = host ? `${proto}://${host}` : '';
    const baseUrl = (process.env.APP_URL || inferredBaseUrl || `http://localhost:${PORT}`).trim();

    const result = await whatsappContactService.dispatchPhotoToContacts(report, contacts, baseUrl);
    return res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error('WhatsApp contact dispatch error:', err);
    return res.status(500).json({
      success: false,
      dispatches: [],
      error: err instanceof Error ? err.message : 'Failed to dispatch WhatsApp photo alert',
    });
  }
});

// Test WhatsApp Alert Endpoint
app.post('/api/dispatch/test-whatsapp', async (req, res) => {
  try {
    const { contact } = req.body || {};
    if (!contact || !contact.phone) {
      return res.status(400).json({ success: false, error: 'Emergency contact phone is required' });
    }

    const forwardedProto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim();
    const proto = forwardedProto || req.protocol || 'https';
    const host = req.get('host');
    const inferredBaseUrl = host ? `${proto}://${host}` : '';
    const baseUrl = (process.env.APP_URL || inferredBaseUrl || `http://localhost:${PORT}`).trim();

    const testReport = {
      id: `watest_${Date.now()}`,
      reportId: `WA-TEST-${Math.floor(1000 + Math.random() * 9000)}`,
      photoUrl: '',
      latitude: 37.7749,
      longitude: -122.4194,
      address: 'Emergency Contact WhatsApp Test Location',
      googleMapsUrl: 'https://www.google.com/maps?q=37.7749,-122.4194',
      emergencyMessage: 'Test alert: Clicked accident photos & GPS automatically route to this WhatsApp number.',
      quickMessageType: 'WhatsApp Test',
      category: 'Vehicle' as const,
      status: 'Pending' as const,
      priority: 'High' as const,
      priorityReason: 'User triggered WhatsApp emergency contact test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = await whatsappContactService.dispatchPhotoToContacts(
      testReport,
      [{ ...contact, enabled: true, whatsappEnabled: true }],
      baseUrl
    );
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('Test WhatsApp dispatch error:', err);
    return res.status(500).json({
      success: false,
      dispatches: [],
      error: err instanceof Error ? err.message : 'Test WhatsApp dispatch failed',
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Accident Alert Emergency System' });
});

// Dev / Prod Vite Integration
const isProd = process.env.NODE_ENV === 'production';

async function startServer() {
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  // Start background Firestore watcher for Critical accident reports
  twilioDispatcherService.startFirestoreCriticalListener();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Emergency Alert System running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
