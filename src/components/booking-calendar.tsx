"use client";

import { Calendar as BigCalendar, dateFnsLocalizer } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { enUS } from "date-fns/locale/en-US";
import type { Booking } from "@/lib/api";

const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales: { "en-US": enUS } });

export function BookingCalendar({ bookings, onSelect }: { bookings: Booking[]; onSelect: (booking: Booking) => void }) {
  return (
    <div className="h-[650px] overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
      <div className="h-full min-w-[620px]">
        <BigCalendar
          localizer={localizer}
          events={bookings.map((booking) => ({ ...booking, start: new Date(booking.startsAt), end: new Date(booking.endsAt) }))}
          startAccessor="start"
          endAccessor="end"
          onSelectEvent={(event) => onSelect(event as unknown as Booking)}
          views={["month", "week", "day"]}
          defaultView="month"
        />
      </div>
    </div>
  );
}
