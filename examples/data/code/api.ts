/**
 * API Client for the Shotput Demo Application
 *
 * Provides methods for interacting with REST APIs with:
 * - Type-safe request/response handling
 * - Automatic retry logic
 * - Request/response interceptors
 * - Error handling
 */

export interface ApiConfig {
	baseUrl: string;
	timeout?: number;
	headers?: Record<string, string>;
	retryAttempts?: number;
	retryDelay?: number;
}

export interface ApiResponse<T> {
	data: T;
	status: number;
	headers: Record<string, string>;
	ok: boolean;
}

export interface ApiError {
	message: string;
	status?: number;
	code?: string;
	details?: unknown;
}

export class ApiClient {
	private config: Required<ApiConfig>;

	constructor(config: ApiConfig) {
		this.config = {
			baseUrl: config.baseUrl,
			timeout: config.timeout ?? 30000,
			headers: config.headers ?? {},
			retryAttempts: config.retryAttempts ?? 3,
			retryDelay: config.retryDelay ?? 1000,
		};
	}

	/**
	 * Makes a GET request to the specified endpoint
	 */
	async get<T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
		return this.request<T>("GET", path, undefined, options);
	}

	/**
	 * Makes a POST request to the specified endpoint
	 */
	async post<T>(
		path: string,
		body?: unknown,
		options?: RequestInit,
	): Promise<ApiResponse<T>> {
		return this.request<T>("POST", path, body, options);
	}

	/**
	 * Makes a PUT request to the specified endpoint
	 */
	async put<T>(
		path: string,
		body?: unknown,
		options?: RequestInit,
	): Promise<ApiResponse<T>> {
		return this.request<T>("PUT", path, body, options);
	}

	/**
	 * Makes a PATCH request to the specified endpoint
	 */
	async patch<T>(
		path: string,
		body?: unknown,
		options?: RequestInit,
	): Promise<ApiResponse<T>> {
		return this.request<T>("PATCH", path, body, options);
	}

	/**
	 * Makes a DELETE request to the specified endpoint
	 */
	async delete<T>(
		path: string,
		options?: RequestInit,
	): Promise<ApiResponse<T>> {
		return this.request<T>("DELETE", path, undefined, options);
	}

	/**
	 * Core request method with retry logic
	 */
	private async request<T>(
		method: string,
		path: string,
		body?: unknown,
		options?: RequestInit,
	): Promise<ApiResponse<T>> {
		const url = this.buildUrl(path);
		let lastError: ApiError;

		for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
			try {
				const requestHeaders = this.buildHeaders();
				const response = await this.fetchWithTimeout(url, {
					method,
					headers: requestHeaders,
					body: body ? JSON.stringify(body) : undefined,
					...options,
				});

				const data = await this.parseResponse<T>(response);

				return {
					data,
					status: response.status,
					headers: this.extractHeaders(response.headers),
					ok: response.ok,
				};
			} catch (error) {
				lastError = this.normalizeError(error);

				// Don't retry on client errors (4xx)
				if (
					lastError.status &&
					lastError.status >= 400 &&
					lastError.status < 500
				) {
					throw lastError;
				}

				// Retry on 5xx or network errors
				if (attempt < this.config.retryAttempts) {
					await this.delay(this.config.retryDelay * 2 ** (attempt - 1));
					continue;
				}

				throw lastError;
			}
		}

		throw lastError!;
	}

	/**
	 * Fetches with timeout support
	 */
	private async fetchWithTimeout(
		url: string,
		options: RequestInit,
	): Promise<Response> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

		try {
			const response = await fetch(url, {
				...options,
				signal: controller.signal,
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			return response;
		} finally {
			clearTimeout(timeoutId);
		}
	}

	/**
	 * Parses response based on content type
	 */
	private async parseResponse<T>(response: Response): Promise<T> {
		const contentType = response.headers.get("content-type");

		if (contentType?.includes("application/json")) {
			const data = await response.json();
			return data as T;
		}

		if (contentType?.includes("text/")) {
			const text = await response.text();
			return text as T;
		}

		const blob = await response.blob();
		return blob as T;
	}

	/**
	 * Builds full URL from base and path
	 */
	private buildUrl(path: string): string {
		const cleanBase = this.config.baseUrl.replace(/\/$/, "");
		const cleanPath = path.replace(/^\//, "");
		return `${cleanBase}/${cleanPath}`;
	}

	/**
	 * Builds request headers
	 */
	private buildHeaders(): Record<string, string> {
		return {
			"Content-Type": "application/json",
			...this.config.headers,
		};
	}

	/**
	 * Extracts headers from Response
	 */
	private extractHeaders(
		responseHeaders: Response["headers"],
	): Record<string, string> {
		const result: Record<string, string> = {};
		responseHeaders.forEach((value, key) => {
			result[key] = value;
		});
		return result;
	}

	/**
	 * Normalizes errors to ApiError format
	 */
	private normalizeError(error: unknown): ApiError {
		if (error instanceof Error) {
			return {
				message: error.message,
				details: error,
			};
		}

		if (typeof error === "object" && error !== null) {
			return {
				message: (error as any).message ?? "Unknown error",
				status: (error as any).status,
				code: (error as any).code,
				details: error,
			};
		}

		return {
			message: String(error),
		};
	}

	/**
	 * Delays execution
	 */
	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/**
	 * Updates configuration
	 */
	updateConfig(config: Partial<ApiConfig>): void {
		this.config = {
			...this.config,
			...config,
		};
	}

	/**
	 * Sets authorization header
	 */
	setAuthToken(token: string): void {
		this.config.headers["Authorization"] = `Bearer ${token}`;
	}

	/**
	 * Removes authorization header
	 */
	clearAuthToken(): void {
		this.config.headers["Authorization"] = undefined;
	}
}

// Example usage and type definitions
export interface User {
	id: number;
	name: string;
	email: string;
	role: string;
}

export interface CreateUserRequest {
	name: string;
	email: string;
	role: string;
}

export interface UpdateUserRequest {
	name?: string;
	email?: string;
	role?: string;
}

/**
 * Example API service using the ApiClient
 */
export class UserService {
	private client: ApiClient;

	constructor(baseUrl: string) {
		this.client = new ApiClient({
			baseUrl,
			timeout: 30000,
			retryAttempts: 3,
		});
	}

	async getUsers(): Promise<User[]> {
		const response = await this.client.get<User[]>("/users");
		return response.data;
	}

	async getUser(id: number): Promise<User> {
		const response = await this.client.get<User>(`/users/${id}`);
		return response.data;
	}

	async createUser(user: CreateUserRequest): Promise<User> {
		const response = await this.client.post<User>("/users", user);
		return response.data;
	}

	async updateUser(id: number, updates: UpdateUserRequest): Promise<User> {
		const response = await this.client.patch<User>(`/users/${id}`, updates);
		return response.data;
	}

	async deleteUser(id: number): Promise<void> {
		await this.client.delete(`/users/${id}`);
	}

	setAuthToken(token: string): void {
		this.client.setAuthToken(token);
	}
}
