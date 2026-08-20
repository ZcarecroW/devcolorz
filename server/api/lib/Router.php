<?php

declare(strict_types=1);

namespace DevColorz;

/**
 * A small path router.
 *
 * Patterns use `{name}` for a single path segment. Enough for a JSON API of
 * this size, and small enough to read in one sitting — which is worth more here
 * than the features a framework would bring along with its update treadmill.
 */
final class Router
{
    /** @var list<array{method: string, regex: string, params: list<string>, handler: callable}> */
    private array $routes = [];

    public function add(string $method, string $pattern, callable $handler): void
    {
        $params = [];
        $regex = preg_replace_callback(
            '/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/',
            static function (array $m) use (&$params): string {
                $params[] = $m[1];
                return '([^/]+)';
            },
            $pattern,
        ) ?? $pattern;

        $this->routes[] = [
            'method'  => strtoupper($method),
            'regex'   => '#^' . $regex . '$#',
            'params'  => $params,
            'handler' => $handler,
        ];
    }

    public function get(string $pattern, callable $handler): void
    {
        $this->add('GET', $pattern, $handler);
    }

    public function post(string $pattern, callable $handler): void
    {
        $this->add('POST', $pattern, $handler);
    }

    public function patch(string $pattern, callable $handler): void
    {
        $this->add('PATCH', $pattern, $handler);
    }

    public function delete(string $pattern, callable $handler): void
    {
        $this->add('DELETE', $pattern, $handler);
    }

    /**
     * Dispatch, or end the request with 404 / 405.
     *
     * The 405 path matters: answering 404 for a known path with the wrong verb
     * sends the caller hunting for a typo that is not there.
     */
    public function dispatch(string $method, string $path): never
    {
        $allowed = [];

        foreach ($this->routes as $route) {
            if (!preg_match($route['regex'], $path, $matches)) {
                continue;
            }
            if ($route['method'] !== $method) {
                $allowed[] = $route['method'];
                continue;
            }
            array_shift($matches);
            $args = [];
            foreach ($route['params'] as $index => $name) {
                $args[$name] = rawurldecode($matches[$index] ?? '');
            }
            ($route['handler'])($args);
            // A handler is expected to end the request itself; if one returns,
            // treat it as a successful no-content response rather than falling
            // through to a confusing 404.
            Http::noContent();
        }

        if ($allowed !== []) {
            header('Allow: ' . implode(', ', array_unique($allowed)));
            Http::problem(405, 'Method not allowed', 'This endpoint does not accept ' . $method . '.');
        }
        Http::notFound();
    }
}
