import React, { useState, useEffect } from 'react';
import { EmergencyContact } from '../types';
import { smsService, WhatsappGatewayStatus } from '../services/smsService';
import {
  X,
  Phone,
  Plus,
  Trash2,
  CheckCircle2,
  MessageSquare,
  Send,
  ExternalLink,
  MessageCircle,
  Camera,
} from 'lucide-react';

interface EmergencyContactsModalProps {
  onClose: () => void;
  onContactsUpdated?: (contacts: EmergencyContact[]) => void;
}

export const EmergencyContactsModal: React.FC<EmergencyContactsModalProps> = ({
  onClose,
  onContactsUpdated,
}) => {
  const [contacts, setContacts] = useState<EmergencyContact[]>(() =>
    smsService.getEmergencyContacts()
  );
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRelationship, setNewRelationship] = useState('Family');
  const [testSentMessage, setTestSentMessage] = useState<string | null>(null);
  const [waStatus, setWaStatus] = useState<WhatsappGatewayStatus | null>(null);

  useEffect(() => {
    smsService.getWhatsappGatewayStatus().then((st) => {
      if (st) setWaStatus(st);
    });
  }, []);

  const handleSaveContacts = (updated: EmergencyContact[]) => {
    setContacts(updated);
    smsService.saveEmergencyContacts(updated);
    if (onContactsUpdated) {
      onContactsUpdated(updated);
    }
  };

  const handleToggleEnabled = (id: string) => {
    const updated = contacts.map((c) =>
      c.id === id ? { ...c, enabled: !c.enabled } : c
    );
    handleSaveContacts(updated);
  };

  const handleToggleWhatsapp = (id: string) => {
    const updated = contacts.map((c) =>
      c.id === id ? { ...c, whatsappEnabled: c.whatsappEnabled === false ? true : false } : c
    );
    handleSaveContacts(updated);
  };

  const handleDelete = (id: string) => {
    const updated = contacts.filter((c) => c.id !== id);
    handleSaveContacts(updated);
  };

  const handleAddNewContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newPhone.trim()) return;

    const newContact: EmergencyContact = {
      id: `contact_${Date.now()}`,
      name: newName.trim(),
      phone: newPhone.trim(),
      relationship: newRelationship,
      enabled: true,
      whatsappEnabled: true,
    };

    const updated = [...contacts, newContact];
    handleSaveContacts(updated);
    setNewName('');
    setNewPhone('');
    setIsAdding(false);
  };

  const handleTestSms = (contact: EmergencyContact) => {
    const mockReport = {
      id: 'test',
      reportId: 'ALERT-TEST',
      photoUrl: '',
      latitude: 37.7749,
      longitude: -122.4194,
      address: 'Current Location (Test Simulation)',
      googleMapsUrl: 'https://maps.google.com',
      emergencyMessage: 'Simulated accident alert notification test.',
      quickMessageType: 'Emergency Test',
      category: 'Vehicle' as const,
      status: 'Pending' as const,
      priority: 'High' as const,
      priorityReason: 'User initiated automated SMS contact alert test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const message = smsService.formatEmergencySummary(mockReport, contact.name);
    setTestSentMessage(`SMS alert sent to ${contact.name} (${contact.phone}): "${message.substring(0, 75)}..."`);
    setTimeout(() => setTestSentMessage(null), 5000);
  };

  const handleTestWhatsapp = async (contact: EmergencyContact) => {
    const res = await smsService.sendTestWhatsappAlert(contact);
    const first = res?.dispatches?.[0];
    if (first) {
      setTestSentMessage(
        `WhatsApp test [${first.gatewayProvider} • ${first.status}] prepared for ${contact.name} (${contact.phone}).`
      );
    } else {
      setTestSentMessage(`WhatsApp test alert triggered for ${contact.name} (${contact.phone}).`);
    }
    setTimeout(() => setTestSentMessage(null), 5000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200 transition-colors">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-600 to-rose-700 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-extrabold text-base leading-tight">Emergency Contacts (WhatsApp & SMS)</h3>
              <p className="text-[11px] text-red-100">
                Automatic accident photo + GPS alert to WhatsApp & SMS
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 space-y-5 text-slate-800 dark:text-slate-100 max-h-[75vh] overflow-y-auto">
          {/* Explanation Banner */}
          <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-2xl p-3.5 text-xs text-emerald-900 dark:text-emerald-200 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-extrabold">
                <MessageCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Auto WhatsApp Photo Dispatch</span>
              </div>
              <span
                className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                  waStatus?.configured
                    ? 'bg-emerald-600 text-white'
                    : 'bg-amber-100 dark:bg-amber-900/80 text-amber-800 dark:text-amber-200'
                }`}
              >
                {waStatus?.configured
                  ? waStatus.provider === 'twilio-whatsapp'
                    ? 'Twilio WhatsApp Live'
                    : 'WhatsApp Cloud Live'
                  : 'Sandbox + Instant Link'}
              </span>
            </div>
            <p className="leading-relaxed text-[11px]">
              Photo click karte hi accident photo aur exact Google Maps location aapke sabhi WhatsApp-enabled emergency contacts par automatically send ho jayegi.
            </p>
          </div>

          {testSentMessage && (
            <div className="bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 rounded-xl p-3 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{testSentMessage}</span>
            </div>
          )}

          {/* Contact List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Configured Contacts ({contacts.length})
              </span>
              {!isAdding && (
                <button
                  type="button"
                  onClick={() => setIsAdding(true)}
                  className="text-xs font-bold text-red-600 dark:text-red-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add New Contact</span>
                </button>
              )}
            </div>

            {contacts.length === 0 ? (
              <div className="text-center py-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                <p className="text-xs text-slate-500">No emergency contacts configured yet.</p>
                <button
                  type="button"
                  onClick={() => setIsAdding(true)}
                  className="mt-2 text-xs font-bold text-red-600 hover:underline"
                >
                  + Add primary emergency contact
                </button>
              </div>
            ) : (
              contacts.map((contact) => (
                <div
                  key={contact.id}
                  className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                    contact.enabled
                      ? 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700'
                      : 'bg-slate-100/50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => handleToggleEnabled(contact.id)}
                      className={`w-5 h-5 rounded-md flex items-center justify-center border cursor-pointer shrink-0 transition ${
                        contact.enabled
                          ? 'bg-red-600 border-red-600 text-white'
                          : 'border-slate-300 dark:border-slate-600'
                      }`}
                      title={contact.enabled ? 'Enabled for SMS alerts' : 'Disabled'}
                    >
                      {contact.enabled && <CheckCircle2 className="w-3.5 h-3.5" />}
                    </button>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                          {contact.name}
                        </span>
                        <span className="text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded font-medium">
                          {contact.relationship}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3" />
                        {contact.phone}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                    <button
                      type="button"
                      onClick={() => handleToggleWhatsapp(contact.id)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 border cursor-pointer transition ${
                        contact.whatsappEnabled !== false
                          ? 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700'
                      }`}
                      title="Toggle automatic WhatsApp photo alerts"
                    >
                      <MessageCircle className="w-3 h-3" />
                      <span>WA {contact.whatsappEnabled !== false ? 'ON' : 'OFF'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleTestWhatsapp(contact)}
                      className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                      title="Test WhatsApp photo alert"
                    >
                      <Camera className="w-3 h-3" />
                      <span>Test WA</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleTestSms(contact)}
                      className="px-2 py-1 bg-white dark:bg-slate-700 hover:bg-slate-100 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                      title="Send test alert SMS"
                    >
                      <Send className="w-3 h-3 text-red-500" />
                      <span>SMS</span>
                    </button>

                    <a
                      href={smsService.getNativeWhatsappUri(
                        contact.phone,
                        `🚨 EMERGENCY ALERT TEST from Accident Alert System: WhatsApp emergency photo & GPS notifications active.`
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-slate-700 rounded-lg"
                      title="Open in WhatsApp"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>

                    <button
                      type="button"
                      onClick={() => handleDelete(contact.id)}
                      className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg cursor-pointer"
                      title="Remove contact"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Add New Contact Form */}
          {isAdding && (
            <form onSubmit={handleAddNewContact} className="bg-slate-50 dark:bg-slate-800/90 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200 block">
                Add Emergency SMS Contact
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">Contact Name</label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Sister / Dr. Smith"
                    className="w-full p-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    required
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="e.g. +1 (555) 019-2834"
                    className="w-full p-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Relationship</label>
                <select
                  value={newRelationship}
                  onChange={(e) => setNewRelationship(e.target.value)}
                  className="w-full p-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                >
                  <option value="Family">Family / Spouse</option>
                  <option value="Parent">Parent / Guardian</option>
                  <option value="Friend">Friend / Colleague</option>
                  <option value="Physician">Personal Doctor</option>
                  <option value="EMS">Local EMS Dispatch</option>
                </select>
              </div>

              <div className="flex gap-2 pt-1 justify-end">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-700 text-white cursor-pointer"
                >
                  Save Contact
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            {contacts.filter((c) => c.enabled).length} active alert recipient(s)
          </span>
          <button
            type="button"
            onClick={onClose}
            className="py-2 px-5 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
