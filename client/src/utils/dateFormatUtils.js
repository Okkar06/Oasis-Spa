import { isValid, parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

/**
 * Safely parse and format a date string or Date object
 * @param {string | Date | null | undefined} dateValue - The date to format
 * @param {string} formatStr - The format string (date-fns format)
 * @returns {string} - Formatted date string or 'N/A' if invalid
 */
export const formatDateDisplay = (dateValue, formatStr = 'MMM dd, yyyy HH:mm:ss', timeZone = 'Asia/Singapore') => {
  if (!dateValue) return 'N/A';

  try {
    let dateObj;

    // Handle Date object
    if (dateValue instanceof Date) {
      dateObj = dateValue;
    } else if (typeof dateValue === 'string') {
      // Try parsing ISO string first
      dateObj = parseISO(dateValue);
      // Fallback: attempt generic Date parsing if ISO parsing fails
      if (!isValid(dateObj)) {
        const fallback = new Date(dateValue);
        dateObj = fallback;
      }
    } else if (typeof dateValue === 'number') {
      // Numeric timestamp (ms)
      dateObj = new Date(dateValue);
    } else {
      return 'Invalid Date';
    }

    // Validate the parsed date
    if (!isValid(dateObj)) {
      return 'Invalid Date';
    }

    return formatInTimeZone(dateObj, timeZone, formatStr);
  } catch (error) {
    console.error('Error formatting date:', error, dateValue);
    return 'Invalid Date';
  }
};

/**
 * Format date as a short date string (e.g., "Nov 12, 2025")
 * @param {string | Date | null | undefined} dateValue - The date to format
 * @returns {string} - Formatted date string or 'N/A' if invalid
 */
export const formatDateShort = (dateValue) => {
  return formatDateDisplay(dateValue, 'MMM dd, yyyy');
};

/**
 * Format date with time (e.g., "Nov 12, 2025 2:30 PM")
 * @param {string | Date | null | undefined} dateValue - The date to format
 * @returns {string} - Formatted date string or 'N/A' if invalid
 */
export const formatDateWithTime = (dateValue) => {
  return formatDateDisplay(dateValue, 'MMM dd, yyyy p');
};

/**
 * Format date in full format (e.g., "Tuesday, November 12, 2025 2:30:45 PM")
 * @param {string | Date | null | undefined} dateValue - The date to format
 * @returns {string} - Formatted date string or 'N/A' if invalid
 */
export const formatDateFull = (dateValue) => {
  return formatDateDisplay(dateValue, 'EEEE, MMMM dd, yyyy p');
};

/**
 * Format date in ISO format (e.g., "2025-11-12")
 * @param {string | Date | null | undefined} dateValue - The date to format
 * @returns {string} - Formatted date string or 'N/A' if invalid
 */
export const formatDateISO = (dateValue) => {
  return formatDateDisplay(dateValue, 'yyyy-MM-dd');
};

/**
 * Format date and time in ISO format (e.g., "2025-11-12 14:30:45")
 * @param {string | Date | null | undefined} dateValue - The date to format
 * @returns {string} - Formatted date string or 'N/A' if invalid
 */
export const formatDateTimeISO = (dateValue) => {
  return formatDateDisplay(dateValue, 'yyyy-MM-dd HH:mm:ss');
};
