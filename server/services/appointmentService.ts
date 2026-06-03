/**
 * Appointment Service - Prisma Implementation
 * Replaces SQL functions with Prisma ORM for appointment operations
 */

 
import { prisma } from '../lib/prisma.js';
import { Prisma } from '@prisma/client';

/**
 * Check if an employee has a rest day that conflicts with the requested appointment date
 * @param employeeId - The ID of the employee to check
 * @param appointmentDate - The requested appointment date
 * @returns Warning message if conflict exists, null otherwise
 */
export async function checkRestdayConflict(
  employeeId: number,
  appointmentDate: Date
): Promise<string | null> {
  try {
    // Get the day of week (0=Sunday, 1=Monday, ... 6=Saturday)
    const dayOfWeek = appointmentDate.getDay();
    
    // Fetch employee
    const employee = await prisma.employee.findUnique({
      where: { id: BigInt(employeeId) },
      select: { employeeName: true }
    });

    if (!employee) {
      return null;
    }

    // Check timetable for matching rest day
    const timetableEntry = await prisma.timetable.findFirst({
      where: {
        employeeId: BigInt(employeeId),
        restdayNumber: dayOfWeek,
        effectiveStartdate: {
          lte: appointmentDate
        },
        OR: [
          { effectiveEnddate: null },
          { effectiveEnddate: { gte: appointmentDate } }
        ]
      }
    });

    if (timetableEntry) {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayName = dayNames[dayOfWeek];
      const formattedDate = appointmentDate.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });

      return `Warning: ${employee.employeeName} has a rest day on ${dayName} which conflicts with ${formattedDate}`;
    }

    return null;
  } catch (error) {
    console.error('Error checking restday conflict:', error);
    throw error;
  }
}

/**
 * Get maximum duration from a start time for available end times
 * @param appointmentDate - The appointment date
 * @param employeeId - Employee ID (null = any employee)
 * @param excludeAppointmentId - Appointment ID to exclude (for editing)
 * @returns Array of available end times in 30-minute intervals
 */
export async function getMaxDurationFromStartTime(
  appointmentDate: Date,
  employeeId: number | null,
  excludeAppointmentId: number | null = null
): Promise<Array<{ startTime: string; maxEndTime: string }>> {
  try {
    const businessStart = new Date(appointmentDate);
    businessStart.setHours(10, 0, 0, 0);

    const businessEnd = new Date(appointmentDate);
    businessEnd.setHours(21, 0, 0, 0);

    // Get existing appointments for the employee on that date
    const existingAppointments = await prisma.appointment.findMany({
      where: {
        appointmentDate: appointmentDate,
        ...(employeeId && { servicingEmployeeId: BigInt(employeeId) }),
        ...(excludeAppointmentId && {
          NOT: { id: BigInt(excludeAppointmentId) }
        })
      },
      select: {
        startTime: true,
        endTime: true
      },
      orderBy: { startTime: 'asc' }
    });

    const results: Array<{ startTime: string; maxEndTime: string }> = [];

    // Generate 30-minute intervals from 10:00 to 20:30
    for (let hour = 10; hour <= 20; hour++) {
      for (let minute of [0, 30]) {
        const slotStart = new Date(appointmentDate);
        slotStart.setHours(hour, minute, 0, 0);

        // Check if this slot conflicts with existing appointments
        const hasConflict = existingAppointments.some((appt: any) => {
          return slotStart < appt.endTime && slotStart >= appt.startTime;
        });

        if (!hasConflict && slotStart < businessEnd) {
          // Find the maximum possible end time (next appointment or business close)
          let maxEndTime = businessEnd;

          const nextAppointment = existingAppointments.find((appt: any) => appt.startTime && appt.startTime > slotStart);
          if (nextAppointment && nextAppointment.startTime) {
            maxEndTime = nextAppointment.startTime;
          }

          const slotStartTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
          const maxEndHour = maxEndTime.getHours();
          const maxEndMin = maxEndTime.getMinutes();
          const maxEndTimeStr = `${String(maxEndHour).padStart(2, '0')}:${String(maxEndMin).padStart(2, '0')}`;

          results.push({
            startTime: slotStartTime,
            maxEndTime: maxEndTimeStr
          });
        }
      }
    }

    return results;
  } catch (error) {
    console.error('Error getting max duration from start time:', error);
    throw error;
  }
}

/**
 * Get available end times for a given start time
 * @param appointmentDate - The appointment date
 * @param startTime - The selected start time (null = default slots)
 * @param employeeId - Employee ID (null = any employee)
 * @param excludeAppointmentId - Appointment ID to exclude (for editing)
 * @returns Array of available end times
 */
export async function getAvailableEndTimesForStart(
  appointmentDate: Date,
  startTime: string | null,
  employeeId: number | null = null,
  excludeAppointmentId: number | null = null
): Promise<string[]> {
  try {
    const endTimes: string[] = [];

    // If start time is null, return default slots from 10:30 to 21:00
    if (!startTime) {
      for (let hour = 10; hour <= 20; hour++) {
        for (let minute of [30, 0]) {
          if (hour === 20 && minute === 30) continue; // Skip 20:30, go to 21:00
          if (hour === 10 && minute === 0) continue; // Skip 10:00, start at 10:30
          
          const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
          endTimes.push(timeStr);
        }
      }
      return endTimes;
    }

    // Parse start time
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const startDateTime = new Date(appointmentDate);
    startDateTime.setHours(startHour, startMinute, 0, 0);

    // Get max duration info
    const maxDurationInfo = await getMaxDurationFromStartTime(
      appointmentDate,
      employeeId,
      excludeAppointmentId
    );

    const slot = maxDurationInfo.find(s => s.startTime === startTime);
    if (!slot) {
      return endTimes;
    }

    // Parse max end time
    const [maxEndHour, maxEndMinute] = slot.maxEndTime.split(':').map(Number);
    const maxEndDateTime = new Date(appointmentDate);
    maxEndDateTime.setHours(maxEndHour, maxEndMinute, 0, 0);

    // Generate 30-minute intervals from startTime + 30min to maxEndTime or 21:00
    let currentTime = new Date(startDateTime);
    currentTime.setMinutes(currentTime.getMinutes() + 30);

    const businessEnd = new Date(appointmentDate);
    businessEnd.setHours(21, 0, 0, 0);

    while (currentTime <= maxEndDateTime && currentTime <= businessEnd) {
      const hour = currentTime.getHours();
      const minute = currentTime.getMinutes();
      const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      endTimes.push(timeStr);

      currentTime.setMinutes(currentTime.getMinutes() + 30);
    }

    return endTimes;
  } catch (error) {
    console.error('Error getting available end times:', error);
    throw error;
  }
}

/**
 * Create multiple appointments with comprehensive conflict checking
 * @param memberId - The member ID
 * @param appointments - Array of appointment data
 * @param createdBy - Employee ID creating the appointments
 * @param createdAt - Creation timestamp
 */
export async function createAppointmentsWithConflictCheck(
  memberId: number,
  appointments: Array<{
    servicingEmployeeId: number | null;
    appointmentDate: Date;
    startTime: Date;
    endTime: Date;
    remarks?: string;
  }>,
  createdBy: number,
  createdAt: Date
) {
  try {
    return await prisma.$transaction(async (tx: any) => {
      const processedAppointments: Array<{
        servicingEmployeeId: bigint;
        appointmentDate: Date;
        startTime: Date;
        endTime: Date;
        remarks?: string;
      }> = [];

      // Step 1: Assign random employees where needed
      for (let i = 0; i < appointments.length; i++) {
        const appt = appointments[i];
        let employeeId = appt.servicingEmployeeId;

        if (!employeeId) {
          // Find available employee
          const bookedEmployees = new Set<bigint>();

          // Exclude already booked employees for this time slot
          const existingAppointments = await tx.appointment.findMany({
            where: {
              appointmentDate: appt.appointmentDate,
              startTime: { lt: appt.endTime },
              endTime: { gt: appt.startTime }
            },
            select: { servicingEmployeeId: true }
          });

          existingAppointments.forEach((a: any) => {
            if (a.servicingEmployeeId) bookedEmployees.add(a.servicingEmployeeId);
          });

          // Exclude employees assigned in this batch
          processedAppointments.forEach(pa => {
            if (
              pa.appointmentDate.getTime() === appt.appointmentDate.getTime() &&
              pa.startTime < appt.endTime &&
              pa.endTime > appt.startTime
            ) {
              bookedEmployees.add(pa.servicingEmployeeId);
            }
          });

          // Get a random available employee
          const availableEmployee = await tx.employee.findFirst({
            where: {
              employeeIsActive: true,
              id: {
                notIn: Array.from(bookedEmployees)
              }
            },
            orderBy: {
              id: 'asc' // Prisma doesn't support RANDOM(), use asc and take first
            }
          });

          if (!availableEmployee) {
            throw new Error(
              `No available employee found for appointment on ${appt.appointmentDate.toISOString()}`
            );
          }

          employeeId = Number(availableEmployee.id);
        }

        processedAppointments.push({
          servicingEmployeeId: BigInt(employeeId),
          appointmentDate: appt.appointmentDate,
          startTime: appt.startTime,
          endTime: appt.endTime,
          remarks: appt.remarks
        });
      }

      // Step 2: Check internal conflicts among new appointments
      for (let i = 0; i < processedAppointments.length; i++) {
        for (let j = i + 1; j < processedAppointments.length; j++) {
          const appt1 = processedAppointments[i];
          const appt2 = processedAppointments[j];

          if (appt1.appointmentDate.getTime() !== appt2.appointmentDate.getTime()) {
            continue;
          }

          // Check same employee overlap
          if (
            appt1.servicingEmployeeId === appt2.servicingEmployeeId &&
            appt1.startTime < appt2.endTime &&
            appt1.endTime > appt2.startTime
          ) {
            const employee = await tx.employee.findUnique({
              where: { id: appt1.servicingEmployeeId },
              select: { employeeName: true }
            });
            throw new Error(
              `Conflict: ${employee?.employeeName || 'Employee'} has overlapping appointments`
            );
          }

          // Check same member overlap
          if (appt1.startTime < appt2.endTime && appt1.endTime > appt2.startTime) {
            throw new Error(`Conflict: Member has overlapping appointments`);
          }
        }
      }

      // Step 3: Check external conflicts with existing appointments
      for (const appt of processedAppointments) {
        // Check employee conflicts
        const employeeConflict = await tx.appointment.findFirst({
          where: {
            servicingEmployeeId: appt.servicingEmployeeId,
            appointmentDate: appt.appointmentDate,
            startTime: { lt: appt.endTime },
            endTime: { gt: appt.startTime }
          }
        });

        if (employeeConflict) {
          throw new Error(
            `Conflict: Employee already has an appointment at this time`
          );
        }

        // Check member conflicts
        const memberConflict = await tx.appointment.findFirst({
          where: {
            memberId: BigInt(memberId),
            appointmentDate: appt.appointmentDate,
            startTime: { lt: appt.endTime },
            endTime: { gt: appt.startTime }
          }
        });

        if (memberConflict) {
          throw new Error(`Conflict: Member already has an appointment at this time`);
        }
      }

      // Step 4: Insert all appointments
      const createdAppointments = [];
      for (const appt of processedAppointments) {
        const created = await tx.appointment.create({
          data: {
            memberId: BigInt(memberId),
            servicingEmployeeId: appt.servicingEmployeeId,
            appointmentDate: appt.appointmentDate,
            startTime: appt.startTime,
            endTime: appt.endTime,
            remarks: appt.remarks,
            createdBy: BigInt(createdBy),
            createdAt: createdAt,
            updatedAt: createdAt
          }
        });
        createdAppointments.push(created);
      }

      return createdAppointments;
    });
  } catch (error) {
    console.error('Error creating appointments:', error);
    throw error;
  }
}

export default {
  checkRestdayConflict,
  getMaxDurationFromStartTime,
  getAvailableEndTimesForStart,
  createAppointmentsWithConflictCheck
};
