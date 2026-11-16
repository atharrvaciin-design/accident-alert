import React, { useState, useEffect, useMemo } from 'react';
import {
  PhoneCall,
  Ambulance,
  ShieldAlert,
  Flame,
  Truck,
  Plus,
  Trash2,
  ExternalLink,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  HeartPulse,
} from 'lucide-react';
import {
  getEmergencyServicesByCountry,
  EmergencyServiceContact,
  CustomContact,
  getCustomContacts,
  saveCustomContact,
  deleteCustomContact,
} from '../utils/emergencyNumbers';

interface QuickCallListProps {
  countryCode?: string;
  regionName?: string;
}

export const QuickCallList: React.FC<QuickCallListProps> = ({
  countryCode,
  regionName,
}) => {
  const [customContacts, setCustomContacts] = useState<CustomContact[]>([]);
  const [showAddContact, setShowAddContact] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>('');
  const [newNumber, setNewNumber] = useState<string>('');
  const [newRelationship, setNewRelationship] = useState<string>('');
  const [callConfirmModal, setCallConfirmModal] = useState<EmergencyServiceContact | CustomContact | null>(null);

  useEffect(() => {
    setCustomContacts(getCustomContacts());
  }, []);

  const emergencyData = useMemo(() => {
    return getEmergencyServicesByCountry(countryCode);
  }, [countryCode]);

  const handleAddCustomContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newNumber.trim()) return;

    const updated = saveCustomContact({
      name: newName.trim(),
      number: newNumber.trim(),
      relationship: newRelationship.trim() || 'Emergency Contact',
    });

    setCustomContacts(updated);
    setNewName('');
    setNewNumber('');
    setNewRelationship('');
    setShowAddContact(false);
  };

  const handleDeleteCustomContact = (id: string) => {
    const updated = deleteCustomContact(id);
    setCustomContacts(updated);
  };

  const getServiceIcon = (category: string) => {
    switch (category) {
      case 'Ambulance':
        return <Ambulance className="w-5 h-5 text-red-600" />;
      case 'Police':
        return <ShieldAlert className="w-5 h-5 text-blue-600" />;
      case 'Fire':
        return <Flame className="w-5 h-5 text-amber-600" />;
      case 'Highway Patrol':
        return <Truck className="w-5 h-5 text-emerald-600" />;
      case 'Medical Helpline':
        return <HeartPulse className="w-5 h-5 text-rose-600" />;
      default:
        return <PhoneCall className="w-5 h-5 text-red-600" />;
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 transition-colors">
      {/* Header with Detected Location Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 bg-red-50 dark:bg-red-950/80 text-red-600 dark:text-red-400 rounded-2xl shadow-xs border border-red-100 dark:border-red-900">
            <PhoneCall className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-sm sm:text-base text-blue-950 dark:text-white tracking-tight">
                Quick Emergency Dial
              </h3>
              <span className="bg-red-100 dark:bg-red-950/80 text-red-800 dark:text-red-400 text-[10px] font-black uppercase px-2 py-0.5 rounded-full border border-red-200 dark:border-red-900">
                1-Tap Call
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Auto-populated local emergency services for your GPS location
            </p>
          </div>
        </div>

        {/* Location Indicator */}
        <div className="inline-flex items-center gap-1.5 self-start sm:self-auto bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300">
          <MapPin className="w-3.5 h-3.5 text-red-500 shrink-0" />
          <span className="truncate max-w-[200px]">
            {regionName || emergencyData.countryName}
          </span>
          <span className="text-[10px] bg-red-600 text-white font-bold px-1.5 py-0.2 rounded uppercase">
            {emergencyData.countryCode}
          </span>
        </div>
      </div>

      {/* Primary Emergency Banner (e.g. 911 or 112) */}
      <div className="bg-gradient-to-r from-red-600 to-rose-600 rounded-2xl p-4 text-white shadow-md flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-red-200 block">
            National Central Dispatch
          </span>
          <div className="text-2xl font-black tracking-tight flex items-center gap-2">
            <span>{emergencyData.primaryEmergency}</span>
            <span className="text-xs font-semibold opacity-90">All Emergency Services</span>
          </div>
          <p className="text-[11px] text-red-100">
            For critical, life-threatening injuries or massive collisions
          </p>
        </div>

        <a
          href={`tel:${emergencyData.primaryEmergency}`}
          className="py-3 px-5 bg-white text-red-600 hover:bg-red-50 font-black text-sm rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center gap-2 active:scale-95 shrink-0"
        >
          <PhoneCall className="w-4 h-4 fill-current" />
          <span>Call {emergencyData.primaryEmergency}</span>
        </a>
      </div>

      {/* Service Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {emergencyData.services
          .filter((s) => s.number !== emergencyData.primaryEmergency)
          .map((service) => (
            <div
              key={service.id}
              className="bg-slate-50 dark:bg-slate-800 hover:bg-white dark:hover:bg-slate-750 rounded-2xl p-3 border border-slate-200 dark:border-slate-700 hover:border-red-300 dark:hover:border-red-900 transition-all flex items-center justify-between gap-3 shadow-2xs hover:shadow-sm"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shrink-0 shadow-2xs">
                  {getServiceIcon(service.category)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-xs text-blue-950 dark:text-white truncate">
                      {service.name}
                    </span>
                    {service.badge && (
                      <span className="text-[9px] font-extrabold bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 px-1.5 py-0.2 rounded border border-red-200 dark:border-red-900">
                        {service.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {service.description}
                  </p>
                </div>
              </div>

              {/* Call Button */}
              <a
                href={`tel:${service.number}`}
                className="py-2 px-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 shadow-xs active:scale-95 cursor-pointer"
                title={`Call ${service.name}`}
              >
                <PhoneCall className="w-3.5 h-3.5" />
                <span>{service.number}</span>
              </a>
            </div>
          ))}
      </div>

      {/* PERSONAL EMERGENCY CONTACTS SECTION */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
            Personal Emergency Contacts ({customContacts.length})
          </span>
          <button
            type="button"
            onClick={() => setShowAddContact(!showAddContact)}
            className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{showAddContact ? 'Cancel' : 'Add Contact'}</span>
          </button>
        </div>

        {/* Add Contact Form */}
        {showAddContact && (
          <form
            onSubmit={handleAddCustomContact}
            className="p-3 bg-blue-50/60 dark:bg-slate-800/80 rounded-2xl border border-blue-200 dark:border-slate-700 mb-3 space-y-2 text-xs"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                placeholder="Name (e.g. Spouse / Doctor)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                className="p-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100"
              />
              <input
                type="tel"
                placeholder="Phone Number"
                value={newNumber}
                onChange={(e) => setNewNumber(e.target.value)}
                required
                className="p-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100"
              />
              <input
                type="text"
                placeholder="Relationship / Tag (Optional)"
                value={newRelationship}
                onChange={(e) => setNewRelationship(e.target.value)}
                className="p-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAddContact(false)}
                className="py-1.5 px-3 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-200 rounded-lg font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="py-1.5 px-4 bg-blue-900 dark:bg-blue-600 text-white rounded-lg font-bold shadow-xs hover:bg-blue-800 dark:hover:bg-blue-500"
              >
                Save Contact
              </button>
            </div>
          </form>
        )}

        {/* Custom Contacts List */}
        {customContacts.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {customContacts.map((contact) => (
              <div
                key={contact.id}
                className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="font-bold text-xs text-slate-800 truncate">{contact.name}</div>
                  <div className="text-[10px] text-slate-500 truncate">
                    {contact.relationship} • {contact.number}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <a
                    href={`tel:${contact.number}`}
                    className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-2xs"
                    title={`Call ${contact.name}`}
                  >
                    <PhoneCall className="w-3.5 h-3.5" />
                    <span>Call</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => handleDeleteCustomContact(contact.id)}
                    className="p-1.5 text-slate-400 hover:text-red-500 transition"
                    title="Delete contact"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
