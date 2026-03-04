export function parseQueryString<T extends Record<string, unknown>>(
  queryString: string,
): T {
  const result: Record<string, unknown> = {};

  // Check if the query string is empty or null
  if (!queryString) {
    return result as T; // Return an empty object
  }

  // Remove the leading '?' if present
  if (queryString.startsWith("?")) {
    queryString = queryString.slice(1);
  }

  // Split the query string into key-value pairs
  const pairs = queryString.split("&");

  // Iterate over the key-value pairs
  for (const pair of pairs) {
    // Split each pair into key and value
    const [key, value = ""] = pair.split("=").map(decodeURIComponent); //splits the pair, defaults value to '' if no '=', and decodes.

    // Add the key-value pair to the result object
    result[key] = value;
  }

  return result as T;
}
