import { createContext, useContext, useState, type PropsWithChildren } from 'react';

import { startOfLocalDay } from '@/features/agenda/calendar/week';
import { createAgendaFixtures } from '@/features/agenda/fixtures/agenda-fixtures';

import type { AppointmentSessionEntry, AppointmentSessionValue } from './types';

const AppointmentSessionContext = createContext<AppointmentSessionValue | null>(null);

export function AppointmentSessionProvider({ children }: PropsWithChildren) {
  const [appointments, setAppointments] = useState<readonly AppointmentSessionEntry[]>(
    () => createAgendaFixtures(startOfLocalDay(new Date())),
  );

  const getAppointmentById = (appointmentId: string | undefined) => {
    if (!appointmentId) return undefined;
    return appointments.find(({ appointment }) => appointment.id === appointmentId);
  };

  const addAppointment = (entry: AppointmentSessionEntry) => {
    setAppointments((current) => [...current, entry]);
  };

  return (
    <AppointmentSessionContext.Provider
      value={{ appointments, getAppointmentById, addAppointment }}
    >
      {children}
    </AppointmentSessionContext.Provider>
  );
}

export function useAppointmentSession(): AppointmentSessionValue {
  const value = useContext(AppointmentSessionContext);
  if (!value) {
    throw new Error('useAppointmentSession must be used inside AppointmentSessionProvider');
  }
  return value;
}
