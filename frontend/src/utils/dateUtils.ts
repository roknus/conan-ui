/**
 * Formats a timestamp (in seconds since Unix epoch) into a human-readable date string.
 * 
 * @param timestamp - Unix timestamp in seconds (optional)
 * @returns Formatted date string with both date and time, or 'Unknown' if timestamp is not provided
 */
export const formatDate = (timestamp?: number): string => {
    if (!timestamp) return 'Unknown';
    // Convert Unix timestamp (seconds) to JavaScript Date (milliseconds)
    return new Date(timestamp * 1000).toLocaleString();
};
