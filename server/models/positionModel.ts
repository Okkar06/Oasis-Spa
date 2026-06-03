import { pool, getProdPool as prodPool, query as dbQuery, queryOnPool } from '../config/database.js';
import { Positions } from '../types/model.types.js';
import { prisma } from '../lib/prisma.js';

const checkPositionNameExists = async (position_name: string) => {
  try {
    const result = await prisma.position.findFirst({
      where: { positionName: position_name }
    });
    return result !== null;
  } catch (error) {
    console.error(error);
    throw new Error('Error checking position name existence');
  }
};

const getAllPositions = async (offset: number, limit: number, startDate_utc: string, endDate_utc: string) => {
  try {
    const query = `
      SELECT * FROM positions
      WHERE created_at BETWEEN
        COALESCE($3, '0001-01-01'::timestamp with time zone)
        AND $4
      ORDER BY id ASC
      LIMIT $1 OFFSET $2
    `;
    const values = [limit, offset, startDate_utc, endDate_utc];
    const result = await pool().query<Positions>(query, values);

    const totalQuery = `
      SELECT COUNT(*) FROM positions
      WHERE created_at BETWEEN
        COALESCE($1, '0001-01-01'::timestamp with time zone)
        AND $2
    `;
    const totalValues = [startDate_utc, endDate_utc];
    const totalResult = await dbQuery(totalQuery, totalValues);
    const totalFiltered = parseInt(totalResult.rows[0].count, 10);
    const totalPages = Math.ceil(totalFiltered / limit);

    const allCountResult = await dbQuery(`SELECT COUNT(*) FROM positions`);
    const totalCount = parseInt(allCountResult.rows[0].count, 10);

    return {
      positions: result.rows,
      totalPages,
      totalCount,
      startDate_utc,
      endDate_utc,
    };
  } catch (error) {
    console.error('Error fetching positions:', error);
    throw new Error('Error fetching positions');
  }
};
const createPosition = async ({
  position_name,
  position_description,
  position_is_active,
  position_created_at,
  position_updated_at,
}: {
  position_name: string;
  position_description: string;
  position_is_active: boolean;
  position_created_at: string;
  position_updated_at: string;
}) => {
  const client = await pool().connect();
  try {
    await client.query('BEGIN');

    const insertPositionQuery = `
      INSERT INTO positions (position_name, position_description, position_is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;
    const values = [
      position_name,
      position_description,
      position_is_active,
      position_created_at,
      position_updated_at,
    ];

    const result = await client.query<Positions>(insertPositionQuery, values);
    const newPosition = result.rows[0];

    await client.query('COMMIT');
    return newPosition;
  } catch (error) {
    console.error('Error creating position:', error);
    await client.query('ROLLBACK');
    throw new Error('Error creating position');
  } finally {
    client.release();
  }
};

const updatePosition = async (
  id: number,
  {
    position_name,
    position_description,
    position_is_active,
    position_updated_at,
    position_created_at,
  }: {
    position_name?: string;
    position_description?: string;
    position_is_active?: boolean;
    position_updated_at: string;
    position_created_at?: string;
  }
) => {
  const client = await pool().connect();
  try {
    await client.query('BEGIN');

    const updateQuery = `
      UPDATE positions
      SET 
        position_name = COALESCE($2, position_name),
        position_description = COALESCE($3, position_description),
        position_is_active = COALESCE($4, position_is_active),
        updated_at = $5,
        created_at = COALESCE($6, created_at)

      WHERE id = $1
      RETURNING *;
    `;
    const values = [
      id,
      position_name,
      position_description,
      position_is_active,
      position_updated_at,
      position_created_at,
    ];
    const result = await client.query(updateQuery, values);

    if (result.rows.length === 0) {
      throw new Error('Position not found');
    }

    const updatedPosition = result.rows[0];
    await client.query('COMMIT');
    return updatedPosition;
  } catch (error) {
    console.error('Error updating position:', error);
    await client.query('ROLLBACK');
    throw new Error('Error updating position');
  } finally {
    client.release();
  }
};

const deletePosition = async (id: number) => {
  const client = await pool().connect();
  try {
    await client.query('BEGIN');

    // Check if position is being used by any employees
    const checkQuery = `SELECT COUNT(*) FROM employee_to_position WHERE position_id = $1`;
    const checkResult = await client.query(checkQuery, [id]);
    const employeeCount = parseInt(checkResult.rows[0].count, 10);

    if (employeeCount > 0) {
      throw new Error('Cannot delete position: it is assigned to employees');
    }

    const deleteQuery = `DELETE FROM positions WHERE id = $1 RETURNING *`;
    const result = await client.query(deleteQuery, [id]);

    if (result.rows.length === 0) {
      throw new Error('Position not found');
    }

    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    console.error('Error deleting position:', error);
    await client.query('ROLLBACK');
    throw error; // ✅ Re-throw original error instead of overwriting
  } finally {
    client.release();
  }
};

const getPositionById = async (id: number) => {
  try {
    const position = await prisma.position.findUnique({
      where: { id: BigInt(id) }
    });

    if (!position) return null;

    return {
      id: Number(position.id),
      position_name: position.positionName,
      position_description: position.positionDescription,
      position_is_active: position.positionIsActive,
      created_at: position.createdAt,
      updated_at: position.updatedAt
    };
  } catch (error) {
    console.error('Error fetching position by ID:', error);
    throw new Error('Error fetching position');
  }
};

const getAllPositionsForDropdown = async () => {
  try {
    const positions = await prisma.position.findMany({
      where: { positionIsActive: true },
      orderBy: { positionName: 'asc' },
      select: { id: true, positionName: true }
    });

    return positions.map((p: { id: bigint; positionName: string }) => ({
      id: Number(p.id),
      position_name: p.positionName
    }));
  } catch (error) {
    console.error('Error fetching position list:', error);
    throw new Error('Error fetching position list');
  }
};

const getPositionCount = async () => {
  try {
    const count = await prisma.position.count();
    return count;
  } catch (error) {
    console.error('Error getting position count:', error);
    throw new Error('Error getting position count');
  }
};

const togglePositionStatus = async (id: number, position_updated_at: string) => {
  const client = await pool().connect();
  try {
    await client.query('BEGIN');

    const toggleQuery = `
      UPDATE positions
      SET 
        position_is_active = NOT position_is_active,
        updated_at = $2
      WHERE id = $1
      RETURNING *;
    `;
    const values = [id, position_updated_at];
    const result = await client.query<Positions>(toggleQuery, values);

    if (result.rows.length === 0) {
      throw new Error('Position not found');
    }

    const updatedPosition = result.rows[0];
    await client.query('COMMIT');
    return updatedPosition;
  } catch (error) {
    console.error('Error toggling position status:', error);
    await client.query('ROLLBACK');
    throw new Error('Error toggling position status');
  } finally {
    client.release();
  }
};

export default {
  checkPositionNameExists,
  getAllPositions,
  createPosition,
  updatePosition,
  deletePosition,
  getPositionById,
  getAllPositionsForDropdown,
  getPositionCount,
  togglePositionStatus,
};
