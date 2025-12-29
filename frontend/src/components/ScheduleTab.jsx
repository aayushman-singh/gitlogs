import { useState, useEffect } from 'react';
import { HiClock, HiCalendar, HiBell, HiZap, HiCoffee, HiSun, HiMoon, HiInformationCircle, HiSave } from 'react-icons/hi';
import { getScheduleSettings, saveScheduleSettings, getBackendUrl } from '../utils/api';

const weekDays = [
  { id: 'mon', label: 'Mon' },
  { id: 'tue', label: 'Tue' },
  { id: 'wed', label: 'Wed' },
  { id: 'thu', label: 'Thu' },
  { id: 'fri', label: 'Fri' },
  { id: 'sat', label: 'Sat' },
  { id: 'sun', label: 'Sun' },
];

export default function ScheduleTab() {
  const [frequency, setFrequency] = useState('instant');
  const [dailyTime, setDailyTime] = useState('18:00');
  const [morningTime, setMorningTime] = useState('09:00');
  const [eveningTime, setEveningTime] = useState('18:00');
  const [weeklyDay, setWeeklyDay] = useState('fri');
  const [weeklyTime, setWeeklyTime] = useState('17:00');
  const [selectedDays, setSelectedDays] = useState(['mon', 'wed', 'fri']);
  const [customTime, setCustomTime] = useState('12:00');
  const [digestMode, setDigestMode] = useState(true);
  const [timezone, setTimezone] = useState('UTC');
  const [quietHours, setQuietHours] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState({ type: '', message: '' });

  useEffect(() => {
    loadScheduleSettings();
  }, []);

  const loadScheduleSettings = async () => {
    setLoading(true);
    try {
      const settings = await getScheduleSettings();
      if (settings) {
        setFrequency(settings.frequency || 'instant');
        setDailyTime(settings.dailyTime || '18:00');
        setMorningTime(settings.morningTime || '09:00');
        setEveningTime(settings.eveningTime || '18:00');
        setWeeklyDay(settings.weeklyDay || 'fri');
        setWeeklyTime(settings.weeklyTime || '17:00');
        setSelectedDays(settings.selectedDays || ['mon', 'wed', 'fri']);
        setCustomTime(settings.customTime || '12:00');
        setDigestMode(settings.digestMode !== false);
        setTimezone(settings.timezone || 'UTC');
        setQuietHours(settings.quietHours || false);
      }
    } catch (err) {
      console.error('Failed to load schedule settings:', err);
      // Use defaults if API fails
    } finally {
      setLoading(false);
    }
  };

  const toggleDay = (dayId) => {
    setSelectedDays(prev => 
      prev.includes(dayId) 
        ? prev.filter(d => d !== dayId)
        : [...prev, dayId]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setResult({ type: '', message: '' });
    
    try {
      await saveScheduleSettings({
        frequency,
        dailyTime,
        morningTime,
        eveningTime,
        weeklyDay,
        weeklyTime,
        selectedDays,
        customTime,
        digestMode,
        timezone,
        quietHours,
      });
      
      setResult({ 
        type: 'success', 
        message: `Schedule saved! Posts will be sent ${frequency === 'instant' ? 'immediately' : `on a ${frequency} basis`}` 
      });
      
      setTimeout(() => setResult({ type: '', message: '' }), 5000);
    } catch (err) {
      setResult({ type: 'error', message: err.message || 'Failed to save schedule settings' });
    } finally {
      setSaving(false);
    }
  };

  const getScheduleDescription = () => {
    switch (frequency) {
      case 'instant':
        return 'Posts are sent immediately after each commit';
      case 'daily':
        return `Daily digest at ${dailyTime} ${timezone}`;
      case 'twice-daily':
        return `Posts at ${morningTime} and ${eveningTime} ${timezone}`;
      case 'weekly':
        return `Weekly summary every ${weekDays.find(d => d.id === weeklyDay)?.label} at ${weeklyTime}`;
      case 'custom':
        return `Custom schedule: ${selectedDays.map(d => weekDays.find(day => day.id === d)?.label).join(', ')} at ${customTime}`;
      default:
        return 'No schedule set';
    }
  };

  const generateTimeOptions = () => {
    return Array.from({ length: 24 }, (_, i) => {
      const hour = i.toString().padStart(2, '0');
      return { value: `${hour}:00`, label: `${hour}:00` };
    });
  };

  if (loading) {
    return (
      <div className="text-center" style={{ padding: '40px 20px' }}>
        <div className="loading loading-lg"></div>
        <p className="text-muted mt-4">Loading schedule settings...</p>
      </div>
    );
  }

  return (
    <div className="schedule-tab-container">
      {result.message && (
        <div className={`alert alert-${result.type === 'error' ? 'error' : 'success'} mb-4`}>
          {result.type === 'error' ? '❌' : '✅'} {result.message}
        </div>
      )}

      {/* Current Schedule Banner */}
      <div className="card mb-4" style={{ background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ 
              width: 40, 
              height: 40, 
              borderRadius: 8, 
              background: 'rgba(59, 130, 246, 0.1)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center' 
            }}>
              <HiBell size={20} style={{ color: '#3b82f6' }} />
            </div>
            <div>
              <h3 className="card-title" style={{ margin: 0, fontSize: 14 }}>Current Schedule</h3>
              <p className="text-small text-muted" style={{ margin: 0 }}>{getScheduleDescription()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Frequency Selection */}
      <div className="card mb-4">
        <div className="card-header">
          <h2 className="card-title">
            <HiClock size={18} style={{ marginRight: 8 }} />
            Posting Frequency
          </h2>
          <p className="text-muted">Choose how often you want to post your commits to X</p>
        </div>
        <div className="card-body">
          <div className="radio-group" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Instant */}
            <label 
              className={`radio-option ${frequency === 'instant' ? 'radio-option-active' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: 16,
                borderRadius: 8,
                border: `1px solid ${frequency === 'instant' ? '#3b82f6' : '#374151'}`,
                background: frequency === 'instant' ? 'rgba(59, 130, 246, 0.05)' : 'rgba(55, 65, 81, 0.3)',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <input
                type="radio"
                name="frequency"
                value="instant"
                checked={frequency === 'instant'}
                onChange={(e) => setFrequency(e.target.value)}
                style={{ margin: 0 }}
              />
              <div style={{ 
                width: 40, 
                height: 40, 
                borderRadius: 8, 
                background: 'rgba(251, 191, 36, 0.1)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center' 
              }}>
                <HiZap size={20} style={{ color: '#fbbf24' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 500 }}>Instant</span>
                  <span className="badge" style={{ fontSize: 10 }}>Real-time</span>
                </div>
                <p className="text-small text-muted" style={{ margin: 0 }}>Post immediately after each commit</p>
              </div>
            </label>

            {/* Daily */}
            <label 
              className={`radio-option ${frequency === 'daily' ? 'radio-option-active' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: 16,
                borderRadius: 8,
                border: `1px solid ${frequency === 'daily' ? '#3b82f6' : '#374151'}`,
                background: frequency === 'daily' ? 'rgba(59, 130, 246, 0.05)' : 'rgba(55, 65, 81, 0.3)',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <input
                type="radio"
                name="frequency"
                value="daily"
                checked={frequency === 'daily'}
                onChange={(e) => setFrequency(e.target.value)}
                style={{ margin: 0 }}
              />
              <div style={{ 
                width: 40, 
                height: 40, 
                borderRadius: 8, 
                background: 'rgba(59, 130, 246, 0.1)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center' 
              }}>
                <HiCoffee size={20} style={{ color: '#3b82f6' }} />
              </div>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 500 }}>Daily Digest</span>
                <p className="text-small text-muted" style={{ margin: 0 }}>Summarize all commits in one daily post</p>
              </div>
            </label>

            {/* Twice Daily */}
            <label 
              className={`radio-option ${frequency === 'twice-daily' ? 'radio-option-active' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: 16,
                borderRadius: 8,
                border: `1px solid ${frequency === 'twice-daily' ? '#3b82f6' : '#374151'}`,
                background: frequency === 'twice-daily' ? 'rgba(59, 130, 246, 0.05)' : 'rgba(55, 65, 81, 0.3)',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <input
                type="radio"
                name="frequency"
                value="twice-daily"
                checked={frequency === 'twice-daily'}
                onChange={(e) => setFrequency(e.target.value)}
                style={{ margin: 0 }}
              />
              <div style={{ 
                width: 40, 
                height: 40, 
                borderRadius: 8, 
                background: 'rgba(139, 92, 246, 0.1)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center' 
              }}>
                <div style={{ display: 'flex' }}>
                  <HiSun size={16} style={{ color: '#fbbf24' }} />
                  <HiMoon size={16} style={{ color: '#3b82f6', marginLeft: -4 }} />
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 500 }}>Twice Daily</span>
                <p className="text-small text-muted" style={{ margin: 0 }}>Morning and evening summaries</p>
              </div>
            </label>

            {/* Weekly */}
            <label 
              className={`radio-option ${frequency === 'weekly' ? 'radio-option-active' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: 16,
                borderRadius: 8,
                border: `1px solid ${frequency === 'weekly' ? '#3b82f6' : '#374151'}`,
                background: frequency === 'weekly' ? 'rgba(59, 130, 246, 0.05)' : 'rgba(55, 65, 81, 0.3)',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <input
                type="radio"
                name="frequency"
                value="weekly"
                checked={frequency === 'weekly'}
                onChange={(e) => setFrequency(e.target.value)}
                style={{ margin: 0 }}
              />
              <div style={{ 
                width: 40, 
                height: 40, 
                borderRadius: 8, 
                background: 'rgba(34, 197, 94, 0.1)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center' 
              }}>
                <HiCalendar size={20} style={{ color: '#22c55e' }} />
              </div>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 500 }}>Weekly Summary</span>
                <p className="text-small text-muted" style={{ margin: 0 }}>One comprehensive weekly update</p>
              </div>
            </label>

            {/* Custom */}
            <label 
              className={`radio-option ${frequency === 'custom' ? 'radio-option-active' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: 16,
                borderRadius: 8,
                border: `1px solid ${frequency === 'custom' ? '#3b82f6' : '#374151'}`,
                background: frequency === 'custom' ? 'rgba(59, 130, 246, 0.05)' : 'rgba(55, 65, 81, 0.3)',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <input
                type="radio"
                name="frequency"
                value="custom"
                checked={frequency === 'custom'}
                onChange={(e) => setFrequency(e.target.value)}
                style={{ margin: 0 }}
              />
              <div style={{ 
                width: 40, 
                height: 40, 
                borderRadius: 8, 
                background: 'rgba(59, 130, 246, 0.1)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center' 
              }}>
                <HiCalendar size={20} style={{ color: '#3b82f6' }} />
              </div>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 500 }}>Custom Schedule</span>
                <p className="text-small text-muted" style={{ margin: 0 }}>Pick specific days and times</p>
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* Time Settings - Conditional based on frequency */}
      {frequency !== 'instant' && (
        <div className="card mb-4">
          <div className="card-header">
            <h2 className="card-title">
              <HiClock size={18} style={{ marginRight: 8 }} />
              Time Settings
            </h2>
            <p className="text-muted">Configure when your posts should be sent</p>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Timezone */}
              <div className="form-group">
                <label className="form-label">Timezone</label>
                <select
                  className="form-input"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                >
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">Eastern Time (ET)</option>
                  <option value="America/Los_Angeles">Pacific Time (PT)</option>
                  <option value="Europe/London">London (GMT)</option>
                  <option value="Europe/Paris">Paris (CET)</option>
                  <option value="Asia/Tokyo">Tokyo (JST)</option>
                  <option value="Asia/Kolkata">India (IST)</option>
                </select>
              </div>

              {/* Daily Time */}
              {frequency === 'daily' && (
                <div className="form-group">
                  <label className="form-label">Post Time</label>
                  <select
                    className="form-input"
                    value={dailyTime}
                    onChange={(e) => setDailyTime(e.target.value)}
                  >
                    {generateTimeOptions().map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Twice Daily Times */}
              {frequency === 'twice-daily' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <HiSun size={16} style={{ color: '#fbbf24' }} />
                      Morning
                    </label>
                    <select
                      className="form-input"
                      value={morningTime}
                      onChange={(e) => setMorningTime(e.target.value)}
                    >
                      {['06:00', '07:00', '08:00', '09:00', '10:00', '11:00'].map(time => (
                        <option key={time} value={time}>{time}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <HiMoon size={16} style={{ color: '#3b82f6' }} />
                      Evening
                    </label>
                    <select
                      className="form-input"
                      value={eveningTime}
                      onChange={(e) => setEveningTime(e.target.value)}
                    >
                      {['17:00', '18:00', '19:00', '20:00', '21:00', '22:00'].map(time => (
                        <option key={time} value={time}>{time}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Weekly Settings */}
              {frequency === 'weekly' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div className="form-group">
                    <label className="form-label">Day of Week</label>
                    <select
                      className="form-input"
                      value={weeklyDay}
                      onChange={(e) => setWeeklyDay(e.target.value)}
                    >
                      {weekDays.map(day => (
                        <option key={day.id} value={day.id}>{day.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Time</label>
                    <select
                      className="form-input"
                      value={weeklyTime}
                      onChange={(e) => setWeeklyTime(e.target.value)}
                    >
                      {generateTimeOptions().map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Custom Schedule */}
              {frequency === 'custom' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="form-group">
                    <label className="form-label">Select Days</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {weekDays.map(day => (
                        <button
                          key={day.id}
                          type="button"
                          onClick={() => toggleDay(day.id)}
                          className={`btn btn-sm ${selectedDays.includes(day.id) ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ minWidth: 60 }}
                        >
                          {day.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Post Time</label>
                    <select
                      className="form-input"
                      value={customTime}
                      onChange={(e) => setCustomTime(e.target.value)}
                    >
                      {generateTimeOptions().map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Additional Options */}
      {frequency !== 'instant' && (
        <div className="card mb-4">
          <div className="card-header">
            <h2 className="card-title">
              <HiInformationCircle size={18} style={{ marginRight: 8 }} />
              Additional Options
            </h2>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                padding: 16,
                borderRadius: 8,
                border: '1px solid #374151',
                background: 'rgba(55, 65, 81, 0.3)'
              }}>
                <div>
                  <label className="form-label" style={{ margin: 0 }}>Digest Mode</label>
                  <p className="text-small text-muted" style={{ margin: '4px 0 0 0' }}>
                    Combine multiple commits into one post
                  </p>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={digestMode}
                    onChange={(e) => setDigestMode(e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                padding: 16,
                borderRadius: 8,
                border: '1px solid #374151',
                background: 'rgba(55, 65, 81, 0.3)'
              }}>
                <div>
                  <label className="form-label" style={{ margin: 0 }}>Quiet Hours</label>
                  <p className="text-small text-muted" style={{ margin: '4px 0 0 0' }}>
                    Skip posting between 10 PM - 7 AM
                  </p>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={quietHours}
                    onChange={(e) => setQuietHours(e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      <button 
        className="btn btn-primary" 
        onClick={handleSave} 
        disabled={saving}
        style={{ width: '100%' }}
      >
        <HiSave size={16} style={{ marginRight: 8 }} />
        {saving ? 'Saving...' : 'Save Schedule'}
      </button>
    </div>
  );
}

