 
import { query as dbQuery } from '../config/database.js';
import { prisma } from '../lib/prisma.js';
import { format } from 'date-fns';

/**
 * Get paginated + filtered list of appointments.
 * Filters: date range, employee, member, status (upcoming/finished)
 */
const getAllAppointments = async (
  offset: number,
  limit: number,
  startDate?: Date | string | null,
  endDate?: Date | string | null,
  employeeId?: number,
  memberId?: number,
  sortOrder: 'asc' | 'desc' = 'desc',
  status?: 'upcoming' | 'finished'
) => {
  try {
    const now = new Date();
    const toDateStr = (d?: Date | string | null): string | null => {
      if (d == null) return null;
      if (d instanceof Date) {
        return d.toISOString().split('T')[0];
      }
      const s = d.toString().trim();
      return s === '' ? null : s;
    };

    const filters: string[] = [];
    const values: (string | number | null)[] = [limit, offset];
    let paramIndex = 3;

    // --- MAIN QUERY WHERE CLAUSE ---
    if (startDate || endDate) {
      filters.push(
        `a.appointment_date BETWEEN COALESCE($${paramIndex++}::DATE, '0001-01-01') AND COALESCE($${paramIndex++}::DATE, '9999-12-31')`
      );
      values.push(toDateStr(startDate), toDateStr(endDate));
    }

    if (employeeId) {
      filters.push(`a.servicing_employee_id = $${paramIndex}`);
      values.push(employeeId);
      paramIndex++;
    }

    if (memberId) {
      filters.push(`a.member_id = $${paramIndex}`);
      values.push(memberId);
      paramIndex++;
    }

    if (status === 'upcoming') {
      filters.push(`(a.appointment_date + a.start_time) > $${paramIndex}`);
      values.push(toDateStr(now));
      paramIndex++;
    } else if (status === 'finished') {
      filters.push(`(a.appointment_date + a.start_time) <= $${paramIndex}`);
      values.push(toDateStr(now));
      paramIndex++;
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const query = `
      SELECT 
        a.*,
        m.name AS member_name,
        e.employee_name AS servicing_employee_name
      FROM appointments a
      LEFT JOIN members m ON a.member_id = m.id
      LEFT JOIN employees e ON a.servicing_employee_id = e.id
      ${whereClause}
      ORDER BY a.appointment_date ${sortOrder.toUpperCase()}, a.start_time ${sortOrder.toUpperCase()}
      LIMIT $1 OFFSET $2
    `;

    const result = await dbQuery(query, values);

    // --- REBUILD COUNT QUERY WITH REINDEXED PARAMS ---
    const countFilters: string[] = [];
    const countValues: (string | number | null)[] = [];
    let idx = 1;

    if (startDate || endDate) {
      countFilters.push(
        `a.appointment_date BETWEEN COALESCE($${idx++}::DATE, '0001-01-01') AND COALESCE($${idx++}::DATE, '9999-12-31')`
      );
      countValues.push(toDateStr(startDate), toDateStr(endDate));
    }

    if (employeeId) {
      countFilters.push(`a.servicing_employee_id = $${idx++}`);
      countValues.push(employeeId);
    }

    if (memberId) {
      countFilters.push(`a.member_id = $${idx++}`);
      countValues.push(memberId);
    }

    if (status === 'upcoming') {
      countFilters.push(`(a.appointment_date + a.start_time) > $${idx++}`);
      countValues.push(toDateStr(now));
    } else if (status === 'finished') {
      countFilters.push(`(a.appointment_date + a.start_time) <= $${idx++}`);
      countValues.push(toDateStr(now));
    }

    const countWhere = countFilters.length ? `WHERE ${countFilters.join(' AND ')}` : '';
    const totalQuery = `SELECT COUNT(*) FROM appointments a ${countWhere}`;
    const totalResult = await dbQuery(totalQuery, countValues);

    const totalPages = Math.ceil(Number(totalResult.rows[0].count) / limit);

    const totalCount = Number(totalResult.rows[0].count);

    return {
      appointments: result.rows,
      totalPages,
      totalCount,
    };
  } catch (error) {
    console.error('Error fetching appointments:', error);
    throw new Error('Error fetching appointments');
  }
};

/**
 * Get all appointments for a specific day.
 * Used by the schedule view (e.g. /ab/date/:date)
 */
const getAppointmentsByDate = async (appointmentDate: Date | string) => {
  try {
    const dateObj = appointmentDate instanceof Date ? appointmentDate : new Date(appointmentDate);
    const start = new Date(dateObj);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);

    const appointments = await prisma.appointment.findMany({
      where: {
        appointmentDate: {
          gte: start,
          lt: end,
        },
      },
      include: {
        member: { select: { name: true } },
        servicingEmployee: { select: { employeeName: true } },
      },
      orderBy: { startTime: 'asc' },
    });

    // Map to the older shape used by controllers (member_name, servicing_employee_name)
    const rows = appointments.map((a: any) => ({
      id: a.id.toString(),
      memberId: a.memberId,
      servicingEmployeeId: a.servicingEmployeeId,
      appointmentDate: a.appointmentDate,
      startTime: a.startTime,
      endTime: a.endTime,
      remarks: a.remarks,
      createdAt: a.createdAt,
      createdBy: a.createdBy,
      updatedAt: a.updatedAt,
      updatedBy: a.updatedBy,
      member_name: a.member ? a.member.name : null,
      servicing_employee_name: a.servicingEmployee ? a.servicingEmployee.employeeName : null,
    }));

    return {
      appointments: rows,
      totalCount: rows.length,
    };
  } catch (error) {
    console.error('Error fetching appointments by date:', error);
    throw new Error('Error fetching appointments by date');
  }
};

/**
 * Get appointment details by ID.
 * Returns full appointment info including member and employee names.
 */
const getAppointmentById = async (id: number) => {
  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: BigInt(id) },
      include: {
        member: { select: { name: true } },
        servicingEmployee: { select: { employeeName: true } },
        createdByEmployee: { select: { employeeName: true } },
        updatedByEmployee: { select: { employeeName: true } },
      },
    });

    if (!appointment) return null;

    return {
      id: appointment.id.toString(),
      memberId: appointment.memberId,
      servicingEmployeeId: appointment.servicingEmployeeId,
      appointmentDate: appointment.appointmentDate,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      remarks: appointment.remarks,
      createdAt: appointment.createdAt,
      createdBy: appointment.createdBy,
      updatedAt: appointment.updatedAt,
      updatedBy: appointment.updatedBy,
      appointment_date: appointment.appointmentDate ? format(new Date(appointment.appointmentDate), 'yyyy-MM-dd') : null,
      start_time: appointment.startTime ? format(new Date(appointment.startTime), 'HH:mm') : null,
      end_time: appointment.endTime ? format(new Date(appointment.endTime), 'HH:mm') : null,
      created_at: appointment.createdAt ? format(new Date(appointment.createdAt), 'dd MMM yyyy, hh:mm a') : null,
      updated_at: appointment.updatedAt ? format(new Date(appointment.updatedAt), 'dd MMM yyyy, hh:mm a') : null,
      member_name: appointment.member ? appointment.member.name : null,
      servicing_employee_name: appointment.servicingEmployee ? appointment.servicingEmployee.employeeName : null,
      created_by_name: appointment.createdByEmployee ? appointment.createdByEmployee.employeeName : null,
      updated_by_name: appointment.updatedByEmployee ? appointment.updatedByEmployee.employeeName : null,
    };
  } catch (error) {
    console.error('Error fetching appointment by ID:', error);
    throw new Error('Error fetching appointment by ID');
  }
};

const validateEmployeeIsActive = async (employeeId: number): Promise<boolean> => {
  try {
    const employee = await prisma.employee.findUnique({ where: { id: BigInt(employeeId) }, select: { employeeIsActive: true } });
    if (!employee) return false;
    return employee.employeeIsActive === true;
  } catch (error) {
    console.error('Error validating employee:', error);
    throw new Error('Error validating employee');
  }
};

const validateMemberIsActive = async (memberId: number): Promise<boolean> => {
  try {
    const member = await prisma.member.findUnique({ where: { id: BigInt(memberId) }, select: { id: true } });
    return !!member;
  } catch (error) {
    console.error('Error validating member:', error);
    throw new Error('Error validating member');
  }
};

interface AppointmentItem {
  servicing_employee_id: number | null;
  appointment_date: string;
  start_time: string;
  end_time: string;
  remarks?: string;
}
const checkRestdayConflict = async (employeeId: number | null, appointmentDate: Date | string) => {
  try {
    const query = `SELECT check_restday_conflict($1, $2) AS warning`;
    const values = [employeeId, appointmentDate];
    const { rows } = await dbQuery(query, values);
    // rows[0].warning will be either the warning string or null
    return rows[0].warning;
  } catch (error) {
    console.error('Error checking restday conflict:', error);
    throw new Error('Error checking restday conflict');
  }
};

const createAppointment = async (
  memberId: number,
  appointments: AppointmentItem[],
  createdBy: number,
  createdAt: string
): Promise<void> => {
  try {
    // Call the stored procedure create_appointment_ab
    // p_appointments is jsonb array: pass JSON string or JS object
    const query = `CALL create_appointment_ab($1, $2::jsonb, $3, $4)`;
    const values = [memberId, JSON.stringify(appointments), createdBy, createdAt];
    console.log('Creating appointment with values:', values);
    await dbQuery(query, values);
  } catch (error: any) {
    console.error('Error in createAppointment:', error);
    // Rethrow preserving code and message
    const err = new Error(error.message);
    // Attach SQLSTATE code if exists
    if (error.code) {
      // @ts-expect-error: Error type doesn’t include `code`, but we attach SQLSTATE here
      err.code = error.code;
    }
    throw err;
  }
};

export const updateAppointment = async (
  memberId: number,
  appointments: {
    id: number;
    servicing_employee_id: number | null;
    appointment_date: string;
    start_time: string;
    end_time: string;
    remarks: string;
  }[],
  updatedBy: number,
  updatedAt: string
): Promise<void> => {
  try {
    // Stored procedure expects JSON array with each object including id
    const query = `CALL update_appointment_ab($1, $2::jsonb, $3, $4)`;
    const values = [memberId, JSON.stringify(appointments), updatedBy, updatedAt];
    await dbQuery(query, values);
  } catch (error: any) {
    console.error('Error in updateAppointment:', error);
    // Rethrow preserving code and message
    const err = new Error(error.message);
    // Attach SQLSTATE code if exists
    if (error.code) {
      // @ts-expect-error: Error type doesn’t include `code`, but we attach SQLSTATE here
      err.code = error.code;
    }
    throw err;
  }
};

// Get max duration info for all start times
const getMaxDurationFromStartTimes = async (
  date: Date | string,
  employeeId: number | null,
  excludeAppointmentId: number | null
): Promise<any[]> => {
  try {
    const result = await prisma.$queryRawUnsafe(`SELECT * FROM get_max_duration_from_start_time($1, $2, $3)`,
      date,
      employeeId,
      excludeAppointmentId
    );
    return result as any[];
  } catch (error) {
    console.error('Error fetching max durations:', error);
    throw new Error('Error fetching max durations');
  }
};

// Get available end times for specific start time
const getEndTimesForStartTime = async (
  date: Date | string,
  startTime: string,
  employeeId: number | null,
  excludeAppointmentId: number | null
): Promise<any[]> => {
  try {
    const result = await prisma.$queryRawUnsafe(`SELECT * FROM get_available_end_times_for_start($1, $2, $3, $4)`,
      date,
      startTime,
      employeeId,
      excludeAppointmentId
    );
    return result as any[];
  } catch (error) {
    console.error('Error fetching end times:', error);
    throw new Error('Error fetching end times');
  }
};

// Get appointment count by date
const getAppointmentCountByDate = async (date: string): Promise<number> => {
  try {
    const dateObj = new Date(date);
    const start = new Date(dateObj);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);

    const count = await prisma.appointment.count({
      where: {
        appointmentDate: {
          gte: start,
          lt: end,
        },
      },
    });

    return count;
  } catch (error) {
    console.error('Error getting appointment count by date:', error);
    throw new Error('Failed to get appointment count');
  }
};

export default {
  getAllAppointments,
  getAppointmentsByDate,
  getAppointmentById,
  validateEmployeeIsActive,
  validateMemberIsActive,
  checkRestdayConflict,
  createAppointment,
  updateAppointment,
  getEndTimesForStartTime,
  getMaxDurationFromStartTimes,
  getAppointmentCountByDate,
};
