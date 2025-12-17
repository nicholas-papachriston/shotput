# Demo Skill Reference Examples

This file contains practical examples demonstrating the concepts and patterns described in the demo-skill SKILL.md file.

## Example 1: API Client Implementation

### Context
Building a robust API client that follows best practices for error handling, retry logic, and type safety.

### Implementation

```typescript
interface ApiClientConfig {
  baseUrl: string;
  timeout: number;
  retryAttempts: number;
}

class RobustApiClient {
  private config: ApiClientConfig;
  
  constructor(config: ApiClientConfig) {
    this.config = config;
  }
  
  async get<T>(endpoint: string): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const response = await fetch(
          `${this.config.baseUrl}${endpoint}`,
          { signal: AbortSignal.timeout(this.config.timeout) }
        );
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return await response.json();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < this.config.retryAttempts) {
          await this.delay(1000 * Math.pow(2, attempt - 1));
        }
      }
    }
    
    throw lastError!;
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### Usage

```typescript
const client = new RobustApiClient({
  baseUrl: 'https://api.example.com',
  timeout: 5000,
  retryAttempts: 3,
});

const data = await client.get('/users/123');
```

### Key Points
- ✅ Type-safe with generics
- ✅ Configurable retry logic with exponential backoff
- ✅ Timeout support
- ✅ Clear error handling
- ✅ Separation of concerns

## Example 2: Data Validation Pattern

### Context
Validating user input with clear error messages and type safety.

### Implementation

```typescript
interface ValidationResult<T> {
  valid: boolean;
  data?: T;
  errors: string[];
}

class Validator {
  static email(value: string): ValidationResult<string> {
    const errors: string[] = [];
    
    if (!value) {
      errors.push('Email is required');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      errors.push('Invalid email format');
    }
    
    return {
      valid: errors.length === 0,
      data: errors.length === 0 ? value : undefined,
      errors,
    };
  }
  
  static required<T>(value: T, fieldName: string): ValidationResult<T> {
    const errors: string[] = [];
    
    if (value === null || value === undefined || value === '') {
      errors.push(`${fieldName} is required`);
    }
    
    return {
      valid: errors.length === 0,
      data: errors.length === 0 ? value : undefined,
      errors,
    };
  }
  
  static minLength(value: string, min: number): ValidationResult<string> {
    const errors: string[] = [];
    
    if (value.length < min) {
      errors.push(`Minimum length is ${min} characters`);
    }
    
    return {
      valid: errors.length === 0,
      data: errors.length === 0 ? value : undefined,
      errors,
    };
  }
}

function validateUserInput(data: {
  email: string;
  name: string;
  password: string;
}): ValidationResult<typeof data> {
  const errors: string[] = [];
  
  const emailResult = Validator.email(data.email);
  errors.push(...emailResult.errors);
  
  const nameResult = Validator.required(data.name, 'Name');
  errors.push(...nameResult.errors);
  
  const passwordResult = Validator.minLength(data.password, 8);
  errors.push(...passwordResult.errors);
  
  return {
    valid: errors.length === 0,
    data: errors.length === 0 ? data : undefined,
    errors,
  };
}
```

### Usage

```typescript
const result = validateUserInput({
  email: 'user@example.com',
  name: 'John Doe',
  password: 'securePass123',
});

if (result.valid) {
  console.log('Valid data:', result.data);
} else {
  console.error('Validation errors:', result.errors);
}
```

## Example 3: State Management Pattern

### Context
Managing application state with clear update patterns and type safety.

### Implementation

```typescript
type StateUpdater<T> = (prevState: T) => T;

class StateManager<T> {
  private state: T;
  private listeners: Set<(state: T) => void>;
  
  constructor(initialState: T) {
    this.state = initialState;
    this.listeners = new Set();
  }
  
  getState(): Readonly<T> {
    return Object.freeze({ ...this.state });
  }
  
  setState(updater: StateUpdater<T>): void {
    const prevState = this.state;
    this.state = updater(prevState);
    this.notifyListeners();
  }
  
  subscribe(listener: (state: T) => void): () => void {
    this.listeners.add(listener);
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }
  
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      listener(this.getState());
    });
  }
}
```

### Usage

```typescript
interface AppState {
  user: { name: string; id: string } | null;
  loading: boolean;
  error: string | null;
}

const store = new StateManager<AppState>({
  user: null,
  loading: false,
  error: null,
});

// Subscribe to state changes
const unsubscribe = store.subscribe(state => {
  console.log('State updated:', state);
});

// Update state
store.setState(prev => ({
  ...prev,
  loading: true,
}));

store.setState(prev => ({
  ...prev,
  user: { name: 'John', id: '123' },
  loading: false,
}));

// Cleanup
unsubscribe();
```

## Example 4: Error Handling Strategy

### Context
Comprehensive error handling with custom error types and recovery strategies.

### Implementation

```typescript
// Custom error types
class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public endpoint: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

class ValidationError extends Error {
  constructor(
    message: string,
    public fields: Record<string, string[]>
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

class NetworkError extends Error {
  constructor(message: string, public originalError: Error) {
    super(message);
    this.name = 'NetworkError';
  }
}

// Error handler
class ErrorHandler {
  static handle(error: unknown): void {
    if (error instanceof ApiError) {
      console.error(`API Error [${error.statusCode}] at ${error.endpoint}:`, error.message);
      this.notifyUser(`Server error: ${error.message}`);
    } else if (error instanceof ValidationError) {
      console.error('Validation Error:', error.fields);
      this.notifyUser('Please check your input and try again');
    } else if (error instanceof NetworkError) {
      console.error('Network Error:', error.originalError);
      this.notifyUser('Network connection issue. Please try again.');
    } else if (error instanceof Error) {
      console.error('Unexpected Error:', error);
      this.notifyUser('An unexpected error occurred');
    } else {
      console.error('Unknown Error:', error);
      this.notifyUser('Something went wrong');
    }
  }
  
  private static notifyUser(message: string): void {
    // Implementation depends on your UI framework
    console.log('User notification:', message);
  }
}

// Usage in async function
async function fetchUserData(userId: string): Promise<UserData> {
  try {
    const response = await fetch(`/api/users/${userId}`);
    
    if (!response.ok) {
      throw new ApiError(
        'Failed to fetch user data',
        response.status,
        `/api/users/${userId}`
      );
    }
    
    return await response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new NetworkError('Failed to connect to server', error);
    }
    throw error;
  }
}

// Usage
async function main() {
  try {
    const user = await fetchUserData('123');
    console.log('User data:', user);
  } catch (error) {
    ErrorHandler.handle(error);
  }
}
```

## Example 5: Configuration Management

### Context
Managing application configuration with validation and environment-specific overrides.

### Implementation

```typescript
interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  poolSize: number;
}

interface ApiConfig {
  baseUrl: string;
  timeout: number;
  retryAttempts: number;
}

interface AppConfig {
  env: 'development' | 'staging' | 'production';
  database: DatabaseConfig;
  api: ApiConfig;
  features: {
    analytics: boolean;
    debugging: boolean;
  };
}

class ConfigManager {
  private static instance: ConfigManager;
  private config: AppConfig;
  
  private constructor() {
    this.config = this.loadConfig();
    this.validateConfig();
  }
  
  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }
  
  getConfig(): Readonly<AppConfig> {
    return Object.freeze({ ...this.config });
  }
  
  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.config[key];
  }
  
  private loadConfig(): AppConfig {
    const env = (process.env.NODE_ENV || 'development') as AppConfig['env'];
    
    const baseConfig: AppConfig = {
      env,
      database: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'app_db',
        poolSize: parseInt(process.env.DB_POOL_SIZE || '10'),
      },
      api: {
        baseUrl: process.env.API_BASE_URL || 'http://localhost:3000',
        timeout: parseInt(process.env.API_TIMEOUT || '5000'),
        retryAttempts: parseInt(process.env.API_RETRY_ATTEMPTS || '3'),
      },
      features: {
        analytics: env === 'production',
        debugging: env === 'development',
      },
    };
    
    return baseConfig;
  }
  
  private validateConfig(): void {
    if (!this.config.database.host) {
      throw new Error('Database host is required');
    }
    
    if (this.config.database.port < 1 || this.config.database.port > 65535) {
      throw new Error('Invalid database port');
    }
    
    if (this.config.api.timeout < 0) {
      throw new Error('API timeout must be positive');
    }
  }
}

// Usage
const config = ConfigManager.getInstance();
const dbConfig = config.get('database');
console.log('Database host:', dbConfig.host);
```

## Example 6: Logging Pattern

### Context
Structured logging with different levels and contexts.

### Implementation

```typescript
enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  error?: Error;
}

class Logger {
  private minLevel: LogLevel;
  private context: Record<string, unknown>;
  
  constructor(minLevel: LogLevel = LogLevel.INFO, context: Record<string, unknown> = {}) {
    this.minLevel = minLevel;
    this.context = context;
  }
  
  debug(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, context);
  }
  
  info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, context);
  }
  
  warn(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, context);
  }
  
  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, context, error);
  }
  
  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): void {
    if (level < this.minLevel) return;
    
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: { ...this.context, ...context },
      error,
    };
    
    this.write(entry);
  }
  
  private write(entry: LogEntry): void {
    const levelName = LogLevel[entry.level];
    const contextStr = Object.keys(entry.context || {}).length > 0
      ? ` ${JSON.stringify(entry.context)}`
      : '';
    
    const logMessage = `[${entry.timestamp}] ${levelName}: ${entry.message}${contextStr}`;
    
    switch (entry.level) {
      case LogLevel.DEBUG:
      case LogLevel.INFO:
        console.log(logMessage);
        break;
      case LogLevel.WARN:
        console.warn(logMessage);
        break;
      case LogLevel.ERROR:
        console.error(logMessage);
        if (entry.error) {
          console.error(entry.error);
        }
        break;
    }
  }
  
  child(context: Record<string, unknown>): Logger {
    return new Logger(this.minLevel, { ...this.context, ...context });
  }
}

// Usage
const logger = new Logger(LogLevel.DEBUG, { service: 'api' });

logger.info('Server starting', { port: 3000 });
logger.debug('Configuration loaded', { env: 'production' });
logger.warn('High memory usage detected', { usage: '85%' });

try {
  throw new Error('Database connection failed');
} catch (error) {
  logger.error('Fatal error', error as Error, { component: 'database' });
}

// Child logger with additional context
const requestLogger = logger.child({ requestId: 'abc-123' });
requestLogger.info('Processing request');
```

## Summary

These examples demonstrate:

- ✅ Type-safe implementations
- ✅ Error handling patterns
- ✅ Configuration management
- ✅ State management
- ✅ Validation strategies
- ✅ Logging best practices
- ✅ Clean code principles
- ✅ Reusable patterns

Use these as templates for building robust, maintainable applications!