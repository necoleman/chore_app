import { describe, it, expect } from 'vitest';
import {
  fieldsReadBy,
  isFieldRead,
  ignoredScheduleFields,
  clearIgnoredScheduleFields,
  fieldsClearedOnFrequencyChange,
  stripLegacyScheduleFields,
  usesNthWeekday,
  parseWeekdays,
  LEGACY_SCHEDULE_FIELDS,
} from './scheduleFields.js';

// The fields of ignoredScheduleFields() a test usually cares about.
function ignoredNames(chore) {
  return ignoredScheduleFields(chore).map((f) => f.field);
}
function messageFor(chore, field) {
  return ignoredScheduleFields(chore).find((f) => f.field === field)?.message ?? '';
}

describe('fieldsReadBy — mirrors DateUtils.gs', () => {
  it('daily reads the weekday pins and start_date only', () => {
    expect(fieldsReadBy('daily')).toEqual(['weekday_due', 'start_date']);
  });

  it('lead_days is dead on daily and once (clamped to 1 by effectiveLeadDays)', () => {
    expect(isFieldRead('daily', 'lead_days')).toBe(false);
    expect(isFieldRead('once', 'lead_days')).toBe(false);
    expect(isFieldRead('weekly', 'lead_days')).toBe(true);
    expect(isFieldRead('monthly', 'lead_days')).toBe(true);
    expect(isFieldRead('interval', 'lead_days')).toBe(true);
  });

  it('once reads once_date and nothing else — not even start_date', () => {
    expect(fieldsReadBy('once')).toEqual(['once_date']);
  });

  it('interval reads interval_days and the snap weekday, never the monthly fields', () => {
    expect(isFieldRead('interval', 'interval_days')).toBe(true);
    expect(isFieldRead('interval', 'weekday_due')).toBe(true);
    expect(isFieldRead('interval', 'monthly_day')).toBe(false);
    expect(isFieldRead('interval', 'monthly_week')).toBe(false);
  });

  it('monthly never reads interval_days', () => {
    expect(isFieldRead('monthly', 'interval_days')).toBe(false);
  });

  it('an unknown frequency reads nothing', () => {
    expect(fieldsReadBy('custom')).toEqual([]); // removed in v1.10
  });
});

describe('ignoredScheduleFields', () => {
  // The live case: "Organize bathroom shelves" is monthly on the first week of
  // the month and still carries interval_days = 90 from before. The 90 is dead,
  // so a 60-minute chore runs 12x a year while the sheet reads as 4x.
  it('monthly with a stray interval_days warns, naming the column', () => {
    const chore = { frequency: 'monthly', monthly_week: 1, weekday_due: '6', interval_days: '90' };
    expect(ignoredNames(chore)).toEqual(['interval_days']);
    const msg = messageFor(chore, 'interval_days');
    expect(msg).toContain('interval_days');
    expect(msg).toContain('90');
    expect(msg).toContain('monthly');
    expect(msg).toContain('no effect');
  });

  it('interval with a stray monthly_day (and monthly_week) warns about both', () => {
    const chore = { frequency: 'interval', interval_days: '14', monthly_day: '15', monthly_week: 2 };
    expect(ignoredNames(chore).sort()).toEqual(['monthly_day', 'monthly_week']);
    expect(messageFor(chore, 'monthly_day')).toContain('every-N-days chores ignore it');
  });

  it('says nothing when every set field is read', () => {
    expect(ignoredNames({ frequency: 'monthly', monthly_day: '15', lead_days: 7, start_date: '2026-01-01' })).toEqual([]);
    expect(ignoredNames({ frequency: 'daily', weekday_due: '1,4' })).toEqual([]);
    expect(ignoredNames({ frequency: 'interval', interval_days: '90', weekday_due: '0' })).toEqual([]);
    expect(ignoredNames({ frequency: 'once', once_date: '2026-07-04' })).toEqual([]);
  });

  it('ignores blank, null and whitespace values rather than warning about them', () => {
    expect(ignoredNames({
      frequency: 'daily', weekday_due: '', monthly_day: '', monthly_week: null,
      interval_days: '   ', once_date: undefined, lead_days: '',
    })).toEqual([]);
  });

  it('a one-time chore ignores everything but its date', () => {
    const chore = {
      frequency: 'once', once_date: '2026-07-04', weekday_due: '3',
      start_date: '2026-06-01', lead_days: 4, interval_days: '30',
    };
    expect(ignoredNames(chore).sort()).toEqual(['interval_days', 'lead_days', 'start_date', 'weekday_due']);
  });

  it('a daily chore with a lead_days warns — the backend clamps it to 1', () => {
    expect(ignoredNames({ frequency: 'daily', weekday_due: '1,4', lead_days: 4 })).toEqual(['lead_days']);
  });

  describe('the monthly sub-mode', () => {
    it('nth-weekday mode leaves monthly_day inert', () => {
      const chore = { frequency: 'monthly', monthly_week: 2, weekday_due: '5', monthly_day: '15' };
      expect(ignoredNames(chore)).toEqual(['monthly_day']);
      expect(messageFor(chore, 'monthly_day')).toContain('day of the week');
    });

    it('a monthly_week with no weekday does nothing — monthly_day wins', () => {
      const chore = { frequency: 'monthly', monthly_week: 2, monthly_day: '15' };
      expect(ignoredNames(chore)).toEqual(['monthly_week']);
      expect(messageFor(chore, 'monthly_week')).toContain('no weekday');
    });

    it('a weekday with no monthly_week does nothing — monthly_day wins', () => {
      const chore = { frequency: 'monthly', weekday_due: '5', monthly_day: '15' };
      expect(ignoredNames(chore)).toEqual(['weekday_due']);
      expect(messageFor(chore, 'weekday_due')).toContain('monthly_week is not');
    });

    it('does not warn about a half-pair that is itself blank', () => {
      expect(ignoredNames({ frequency: 'monthly', monthly_day: '15' })).toEqual([]);
    });
  });
});

describe('clearing on a frequency change', () => {
  it('monthly → interval drops the monthly fields and keeps the interval ones', () => {
    const before = {
      frequency: 'monthly', monthly_day: '15', monthly_week: 2, weekday_due: '5',
      interval_days: '90', start_date: '2026-06-01', lead_days: 7, name: 'Shelves',
    };
    const after = clearIgnoredScheduleFields({ ...before, frequency: 'interval' });
    expect(after.monthly_day).toBe('');
    expect(after.monthly_week).toBe('');
    // Read by interval (the snap weekday), the interval itself, the anchor and the lead.
    expect(after.weekday_due).toBe('5');
    expect(after.interval_days).toBe('90');
    expect(after.start_date).toBe('2026-06-01');
    expect(after.lead_days).toBe(7);
    // Nothing outside the scheduling columns is touched.
    expect(after.name).toBe('Shelves');
  });

  it('interval → monthly drops interval_days, so the dead 90 cannot linger', () => {
    const after = clearIgnoredScheduleFields({ frequency: 'monthly', interval_days: '90', monthly_week: 1, weekday_due: '6' });
    expect(after.interval_days).toBe('');
    expect(ignoredScheduleFields(after)).toEqual([]);
  });

  it('→ daily drops lead_days, which daily cannot use', () => {
    expect(clearIgnoredScheduleFields({ frequency: 'daily', lead_days: 4, weekday_due: '1,4' })).toMatchObject({
      lead_days: '', weekday_due: '1,4',
    });
  });

  it('→ once drops every other scheduling field', () => {
    const after = clearIgnoredScheduleFields({
      frequency: 'once', once_date: '2026-07-04', weekday_due: '3',
      start_date: '2026-06-01', lead_days: 4, interval_days: '30', monthly_day: '15',
    });
    expect(after).toMatchObject({
      once_date: '2026-07-04', weekday_due: '', start_date: '',
      lead_days: '', interval_days: '', monthly_day: '',
    });
  });

  it('does not clear the monthly sub-mode on a change INTO monthly — which half is live is not the frequency\'s call', () => {
    expect(fieldsClearedOnFrequencyChange('monthly')).toEqual(['interval_days', 'once_date']);
  });

  it('leaves a chore whose fields all apply untouched', () => {
    const chore = { frequency: 'weekly', weekday_due: '0', start_date: '2026-06-01', lead_days: 4 };
    expect(clearIgnoredScheduleFields(chore)).toEqual(chore);
  });
});

describe('the pre-v1.10 columns', () => {
  it('are read by no frequency', () => {
    for (const freq of ['daily', 'weekly', 'monthly', 'interval', 'once']) {
      for (const field of LEGACY_SCHEDULE_FIELDS) {
        expect(isFieldRead(freq, field)).toBe(false);
      }
    }
  });

  it('are stripped from a payload rather than echoed back to the sheet', () => {
    const chore = {
      chore_id: 'c_1', frequency: 'daily', weekday_due: '1,4',
      custom_days: 'monday,thursday', monthly_weekday: '5',
    };
    const payload = stripLegacyScheduleFields(chore);
    expect('custom_days' in payload).toBe(false);
    expect('monthly_weekday' in payload).toBe(false);
    expect(payload).toEqual({ chore_id: 'c_1', frequency: 'daily', weekday_due: '1,4' });
    expect(chore.custom_days).toBe('monday,thursday'); // non-mutating
  });

  it('are not warned about — the editor cannot write them, so there is nothing to act on', () => {
    expect(ignoredNames({ frequency: 'daily', weekday_due: '1', custom_days: 'monday', monthly_weekday: '5' })).toEqual([]);
  });
});

describe('usesNthWeekday / parseWeekdays', () => {
  it('needs both halves of the pair', () => {
    expect(usesNthWeekday({ monthly_week: 2, weekday_due: '5' })).toBe(true);
    expect(usesNthWeekday({ monthly_week: 2, weekday_due: '' })).toBe(false);
    expect(usesNthWeekday({ monthly_week: '', weekday_due: '5' })).toBe(false);
    expect(usesNthWeekday({ monthly_week: null, weekday_due: '5' })).toBe(false);
    expect(usesNthWeekday({})).toBe(false);
  });

  it('reads a comma list and drops anything out of range', () => {
    expect(parseWeekdays('1,4')).toEqual([1, 4]);
    expect(parseWeekdays(' 0 , 6 ')).toEqual([0, 6]);
    expect(parseWeekdays('monday')).toEqual([]); // pre-v1.10 custom_days format
    expect(parseWeekdays('7')).toEqual([]);
    expect(parseWeekdays(null)).toEqual([]);
  });
});
