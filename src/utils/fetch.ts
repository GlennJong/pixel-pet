export async function fetchGet(url: string, headers: Record<string, string>) {
  try {
    const response = await fetch(url, {
      method: "Get",
      headers: headers,
    });
    if (!response.ok) {
      throw new Error(`Response status: ${response.status}`);
    }
    const json = await response.json();
    return json;
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error("An unknown error occurred");
    }
  }
}

export async function fetchPost<T>(
  url: string,
  headers: Record<string, string>,
  body: T,
) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json", // Default to JSON
        ...headers, // Allow overriding and adding headers
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Response status: ${response.status}`);
    }
    const json = await response.json();
    return json;
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error("An unknown error occurred");
    }
  }
}
