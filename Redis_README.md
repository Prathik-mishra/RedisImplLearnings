# Redis --- Learning Notes and Command Reference

> A practical guide to caching, Redis concepts, Redis data structures,
> commands, and real-world use cases. Examples use a BookMyShow-style
> application where helpful. The goal is to explain the ideas in simple
> English while retaining the important technical details.

## Table of contents

1.  [What is caching, and why do we need
    it?](#1-what-is-caching-and-why-do-we-need-it)
2.  [Why is caching faster?](#2-why-is-caching-faster)
3.  [What makes a good candidate for
    caching?](#3-what-makes-a-good-candidate-for-caching)
4.  [What exactly is Redis?](#4-what-exactly-is-redis)
5.  [Why is Redis fast?](#5-why-is-redis-fast)
6.  [Redis data types and data
    structures](#6-redis-data-types-and-data-structures)
7.  [Strings](#7-strings)
8.  [Hashes](#8-hashes)
9.  [Lists](#9-lists)
10. [Sets](#10-sets)
11. [Sorted sets](#11-sorted-sets)
12. [Streams](#12-streams)
13. [Bitmaps](#13-bitmaps)
14. [HyperLogLog](#14-hyperloglog)
15. [Geospatial data](#15-geospatial-data)
16. [Inspecting keys and their
    expiry](#16-inspecting-keys-and-their-expiry)
17. [Key naming and TTL basics](#17-key-naming-and-ttl-basics)
18. [Practical caching pattern:
    cache-aside](#18-practical-caching-pattern-cache-aside)
19. [Common caching problems](#19-common-caching-problems)
20. [Redis versus Kafka](#20-redis-versus-kafka)
21. [Quick command reference](#21-quick-command-reference)
22. [Safety and good practices](#22-safety-and-good-practices)

------------------------------------------------------------------------

## 1. What is caching, and why do we need it?

Imagine you're building BookMyShow. Every time a user opens a movie
page, your backend needs to retrieve:

-   Movie details
-   Theatre information
-   Show timings
-   Seat availability
-   Ratings and other metadata

Without caching, your application might query MySQL every time someone
requests the same movie details.

**Caching** means temporarily storing data closer to the component that
needs it, so the data can be retrieved faster or more cheaply than
fetching it from its original source.

Caching is not necessarily about storing data permanently. It is about
avoiding unnecessary repeated work.

### Example

Suppose 5,000 users open the same movie page. If the movie description
and cast information rarely change, repeatedly reading those details
from MySQL may waste database capacity. The application can keep a copy
in a cache and reuse it.

Seat availability is different: it can change from moment to moment. It
may still be cached briefly in some systems, but the application must
account for the risk of showing stale availability. The final booking
operation must verify the actual availability using the authoritative
system.

------------------------------------------------------------------------

## 2. Why is caching faster?

Different storage layers have different access costs.

  -----------------------------------------------------------------------
  Storage layer                       Typical characteristics
  ----------------------------------- -----------------------------------
  CPU cache                           Extremely fast, tiny, close to the
                                      CPU

  RAM                                 Fast access to in-memory data

  Redis                               Network-accessible, memory-oriented
                                      data store

  Local SSD                           Persistent storage, generally
                                      slower than RAM

  Remote database                     Query processing, network
                                      communication, disk and memory
                                      access
  -----------------------------------------------------------------------

These are broad comparisons, not guaranteed latency numbers. Actual
performance depends on hardware, network distance, workload, query
complexity, and configuration.

For example, retrieving a value already in application memory can avoid
a network round trip. Retrieving a value from Redis usually still
requires a network request, but it can avoid a more expensive database
query.

### Why not store everything in application memory?

Each application process has its own memory. If an application runs on
several servers or Kubernetes pods, each process may have a different
copy of the same value. A shared cache such as Redis allows those
instances to access the same cache.

Redis also has limits: memory costs money, network communication still
takes time, and cached data must be refreshed or invalidated when it
becomes outdated.

------------------------------------------------------------------------

## 3. What makes a good candidate for caching?

Caching works especially well when data is:

-   Read frequently.
-   Expensive to calculate or retrieve.
-   Reused across multiple requests.
-   Acceptable to serve slightly stale, or can be invalidated reliably
    when changed.

Examples include movie metadata, product catalogs, user permissions,
reference data, session information, and computed reports.

It is less straightforward for highly volatile information, such as live
seat availability or financial balances, where stale values can lead to
incorrect decisions.

### A simple decision guide

  -----------------------------------------------------------------------
  Data                    Is it a good cache      Reason
                          candidate?              
  ----------------------- ----------------------- -----------------------
  Movie description       Usually yes             Changes infrequently
                                                  and may be read often

  Product category list   Usually yes             Many requests reuse the
                                                  same data

  Branch or country       Often yes               Usually stable
  reference data                                  

  User session            Often yes               Shared access and
                                                  expiry can be useful

  Live seat availability  Requires care           It changes frequently
                                                  and can affect booking
                                                  correctness

  Account balance         Requires strict design  Stale data can lead to
                                                  incorrect financial
                                                  decisions
  -----------------------------------------------------------------------

Caching is a trade-off: you gain speed and reduce repeated work, but you
must decide how fresh the data needs to be.

------------------------------------------------------------------------

## 4. What exactly is Redis?

Redis is an **in-memory data store** that supports data structures such
as strings, hashes, lists, sets, sorted sets, and streams. It is
commonly used as a cache, but it can also support messaging, counters,
coordination, rate limiting, and other workloads.

Redis is not simply a key-value map like a basic Java `HashMap`. It
exposes operations designed for different kinds of data. For example,
instead of retrieving an entire object and modifying it in your
application, you can increment a Redis counter atomically, add an
element to a set, or retrieve the top entries from a sorted set.

Each Redis entry has a key and a value:

-   **Key:** The identifier you use to find data.
-   **Value:** The data stored under that identifier.
-   **Data type:** The structure Redis uses to represent that value.
-   **Command:** The operation used to read or modify it.

For example:

``` redis
SET movie:101 "Inception"
GET movie:101
```

The first command stores a value. The second retrieves it.

Redis is frequently described as an in-memory database because its
working dataset is held primarily in RAM. However, Redis can also be
configured to persist data to disk, replicate data, and recover after
restarts.

**Important:** Redis is not automatically a cache just because it is
Redis. It becomes a cache when you use it to retain copies of data that
can be obtained from another authoritative source.

Examples:

-   **Redis as a cache:** MySQL is the source of truth for movie
    details.
-   **Redis as a session store:** Redis holds session state used by
    multiple backend instances.
-   **Redis as a queue or stream store:** Redis holds messages awaiting
    processing.
-   **Redis as a counter store:** Redis maintains frequently updated
    counts.

The intended use determines the configuration, durability requirements,
and failure-handling strategy.

### Redis client and server

Your application normally connects to a Redis server through a Redis
client library. For example, a Spring Boot application can use Spring
Data Redis. The client sends commands such as `GET`, `SET`, `HGET`, or
`INCR`, and the server returns results.

A Redis command is not the same as a Java method call on an in-memory
object: a client connected to a remote Redis server usually communicates
over the network.

------------------------------------------------------------------------

## 5. Why is Redis fast?

Several characteristics contribute to Redis performance:

-   **Memory-oriented storage:** Redis can avoid disk access on the
    normal data path.
-   **Efficient data structures:** Different structures are optimized
    for particular operations.
-   **Low-overhead commands:** Operations such as `GET`, `INCR`, and
    `SADD` are direct and simple.
-   **Efficient command execution:** Many Redis commands execute without
    being interrupted by another command in the middle of their
    execution.
-   **Pipelining and batching:** Clients can send multiple commands
    together to reduce network round trips.

Redis is often described as single-threaded, but that description needs
qualification. Command execution has historically been primarily
single-threaded, while modern Redis versions can use additional threads
for networking and other background work, depending on configuration and
version.

A single expensive command can still delay other commands on the same
server. That is why large key scans, very large collection operations,
and expensive scripts must be designed carefully.

### Pipelining in simple terms

Without pipelining, an application might send a command, wait for the
reply, send another command, and wait again. Pipelining allows several
commands to be sent together before waiting for their replies. This can
reduce network waiting time, especially when the Redis server is remote.

Pipelining reduces round trips; it does not automatically make each
individual command cheaper.

------------------------------------------------------------------------

## 6. Redis data types and data structures

The main data types covered in these notes are:

1.  String
2.  Hash
3.  List
4.  Set
5.  Sorted Set
6.  Streams
7.  Bitmap
8.  HyperLogLog
9.  Geospatial

Different types are useful for different jobs:

  -----------------------------------------------------------------------
  Redis type              Basic idea              Common example
  ----------------------- ----------------------- -----------------------
  String                  One value made of bytes Cached API response,
                                                  counter, token

  Hash                    Fields and values under Flat user profile or
                          one key                 configuration

  List                    Ordered sequence of     Simple queue or recent
                          values                  activity

  Set                     Unique members without  Unique participants or
                          meaningful order        membership

  Sorted set              Unique members with     Leaderboard or ranking
                          scores                  

  Stream                  Ordered event records   Background event
                                                  processing

  Bitmap                  Individual bits used as Daily activity tracking
                          flags                   

  HyperLogLog             Approximate count of    Unique visitor estimate
                          unique values           

  Geospatial              Coordinates and         Nearby theatres or
                          proximity operations    delivery partners
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 7. Strings

A Redis string stores a sequence of bytes. That means it can hold
ordinary text, numbers represented as text, serialized JSON, or binary
data.

### 7.1 Basic string commands

  Command                            Meaning
  ---------------------------------- ------------------------------------------
  `SET key value`                    Store a value
  `GET key`                          Retrieve a value
  `MSET key value [key value ...]`   Store multiple key-value pairs
  `MGET key [key ...]`               Retrieve multiple values
  `INCR key`                         Increment an integer value by one
  `DECR key`                         Decrement an integer value by one
  `APPEND key value`                 Append text/bytes to the existing string
  `SETEX key seconds value`          Set a value with expiry in seconds
  `SET key value EX seconds`         Set a value with expiry in seconds
  `SETNX key value`                  Set only if the key does not exist

`SETEX` is a valid command, though `SET key value EX seconds` is a
flexible modern alternative. `SETNX` is also available as a command;
`SET key value NX` is commonly used when adding expiry or other options.

### 7.2 Basic examples

``` redis
SET movie:101 "Inception"
GET movie:101
```

Store several values:

``` redis
MSET movie:101 "Inception" movie:102 "Interstellar"
MGET movie:101 movie:102
```

Increment and decrement a counter:

``` redis
SET movie:101:views 0
INCR movie:101:views
INCR movie:101:views
DECR movie:101:views
GET movie:101:views
```

`INCR` and `DECR` work on integer values. If the key does not exist,
`INCR` treats its starting value as zero and then increments it, so the
result is `1`. If a key contains a non-integer string, the operation
returns an error.

Append to an existing value:

``` redis
SET greeting "Hello"
APPEND greeting " Redis"
GET greeting
```

Result:

``` text
"Hello Redis"
```

### 7.3 Store JSON as a string

You can also store JSON as a string:

``` redis
SET movie:101:details "{\"id\":101,\"name\":\"Inception\"}"
GET movie:101:details
```

Redis treats that JSON as a string, not automatically as a structured
JSON object. You can deserialize it in your application. Redis
deployments with the RedisJSON module can instead use JSON-specific
commands.

### 7.4 Use case 1: Cache a movie response

The response is cached for five minutes:

``` redis
SET movie:101:response "{\"id\":101,\"name\":\"Inception\"}" EX 300
GET movie:101:response
TTL movie:101:response
```

`EX 300` means the key expires after 300 seconds (five minutes). The
exact response format depends on what your application stores.

### 7.5 Use case 2: Request counter

``` redis
INCR api:requests
```

Every call increments the counter atomically. If the key does not exist,
`INCR` initializes it to zero and then increments it.

### 7.6 Use case 3: Rate limiting

Suppose you allow a user 100 requests per minute. A counter can track
the number of requests for that user in the current time window.

A simple fixed-window example is:

``` redis
INCR rate-limit:user:501:window:202610131126
EXPIRE rate-limit:user:501:window:202610131126 60
```

This illustrates the counter idea, not a complete production rate
limiter. In real code, set the expiry safely when the key is first
created, define how the time window is calculated, and make sure the
increment and expiry logic cannot leave the key without the intended
expiry. A Lua script or another atomic pattern may be appropriate.

### 7.7 Use case 4: Distributed lock token

A conditional write can help acquire a lock:

``` redis
SET lock:booking:101 unique-token NX PX 10000
```

-   `NX` means create the key only if it doesn't exist.
-   `PX 10000` gives the lock a 10-second expiry.
-   `unique-token` identifies the owner.

A complete distributed locking implementation also needs safe release
logic, typically a script that deletes the key only if the token still
matches. For high-stakes coordination, lock expiry, process pauses,
fencing, and failure scenarios require additional consideration. This
one command alone is not a complete distributed-locking design.

### 7.8 When should you use strings?

Use strings when you want a single value, cached API response, counter,
token, or serialized object.

------------------------------------------------------------------------

## 8. Hashes --- storing fields inside an object

A hash stores field-value pairs under a single Redis key. Think of it as
a small object or a dictionary.

Suppose you have a user with ID 501. The logical structure is:

``` text
Redis key: user:501

Field       Value
name        Rahul
age         25
city        Mumbai
```

### 8.1 Create a hash

``` redis
HSET user:501 name "Rahul" age 25 city "Mumbai"
```

Retrieve a single field:

``` redis
HGET user:501 city
```

Retrieve every field:

``` redis
HGETALL user:501
```

Update one field:

``` redis
HSET user:501 city "Pune"
```

Increment a numeric field:

``` redis
HINCRBY user:501 age 1
```

These commands operate on the fields within the hash stored at
`user:501`.

### 8.2 String versus Hash

You could store the same user data as a JSON string or as a hash.

  -----------------------------------------------------------------------
  Feature                 JSON in a string        Redis hash
  ----------------------- ----------------------- -----------------------
  Retrieve entire object  Yes                     Yes, using `HGETALL`

  Retrieve one field      Application parses JSON `HGET`

  Update one field        Usually deserialize and `HSET`
                          rewrite JSON            

  Nested objects          Naturally represented   Not natively nested
                          in JSON                 like JSON

  Field-level numeric     Requires application    `HINCRBY` for integer
  increment               logic or specialized    fields
                          commands                
  -----------------------------------------------------------------------

Neither approach is universally better. A hash is useful for flat
objects with independently accessed fields. JSON can be better for
nested documents when suitable JSON commands are available.

### 8.3 Real-world use cases

-   User profile fields.
-   Cached configuration values.
-   Product metadata.
-   Simple session attributes.
-   Per-user counters.

For banking or CRM systems, a hash might cache a non-sensitive reference
object such as branch metadata or a feature configuration. It should not
be treated as a substitute for the authoritative customer record.

------------------------------------------------------------------------

## 9. Lists --- an ordered sequence of values

A Redis list stores ordered elements. It supports operations at both
ends of the list.

Imagine a notification list containing:

``` text
notifications
├── SMS sent
├── Email sent
└── Push notification sent
```

The exact order depends on which push/pop commands you use. The
following example shows the order from left (head) to right (tail).

### 9.1 Add and read list elements

``` redis
LPUSH notifications "SMS sent"
LPUSH notifications "Email sent"
RPUSH notifications "Push notification sent"
LRANGE notifications 0 -1
```

Read elements:

``` redis
LRANGE notifications 0 -1
```

`0` is the first index and `-1` means the last element.

Remove and return an item from the left:

``` redis
LPOP notifications
```

Remove and return an item from the right:

``` redis
RPOP notifications
```

### 9.2 Where are lists used?

**Simple queues.** A producer inserts work, and a consumer removes it.

For example, a basic FIFO queue can add to the right and remove from the
left:

``` redis
RPUSH queue:emails "email-101"
RPUSH queue:emails "email-102"
LPOP queue:emails
```

The first item added is the first item removed.

This illustrates a queue pattern, but it isn't a complete reliable
job-processing system. A consumer crash after removing a task can lose
that task unless additional acknowledgement and recovery mechanisms are
used.

Redis provides commands such as `BLMOVE` for safer list-based processing
patterns, and Streams provide consumer groups and pending-message
tracking.

Lists are also useful for recent activity, small ordered collections,
and simple task buffers.

------------------------------------------------------------------------

## 10. Sets --- a collection of unique elements

A Redis set stores unique members without guaranteeing a meaningful
order.

Suppose you want to track which users have joined a movie's waiting
room:

``` redis
SADD movie:101:waiting-room user:501 user:502 user:503
```

Add a duplicate:

``` redis
SADD movie:101:waiting-room user:501
```

Redis does not create a second copy of `user:501`.

### 10.1 Useful commands

-   `SMEMBERS`: return the members.
-   `SISMEMBER`: check whether a member exists.
-   `SCARD`: count the members.
-   `SREM`: remove a member.

Examples:

``` redis
SMEMBERS movie:101:waiting-room
SISMEMBER movie:101:waiting-room user:501
SCARD movie:101:waiting-room
SREM movie:101:waiting-room user:502
```

### 10.2 Set operations

Sets become particularly useful when you need to compare groups.

Create two sets:

``` redis
SADD movie:101:interested user:1 user:2 user:3
SADD movie:102:interested user:2 user:3 user:4
```

Find users interested in both movies:

``` redis
SINTER movie:101:interested movie:102:interested
```

Result: `user:2` and `user:3`.

Find all users interested in either movie:

``` redis
SUNION movie:101:interested movie:102:interested
```

### 10.3 Use cases

-   Unique participants in an event.
-   Users who liked a post.
-   Tags associated with an entity.
-   Membership and permission groups.
-   Deduplicating identifiers.
-   Finding common interests.

**Key distinction:** A set is for unique membership, not ranking. If you
need the top users by score, use a sorted set.

------------------------------------------------------------------------

## 11. Sorted sets --- ordered members with scores

A Redis sorted set, also known as a ZSET, associates each unique member
with a score. Redis orders members by score, making it ideal for ranking
and score-based retrieval.

Example: a BookMyShow-style movie popularity leaderboard. Here, the
scores might represent popularity points.

### 11.1 Add movies to a leaderboard

``` redis
ZADD movie:popularity 1200 movie:101
ZADD movie:popularity 950 movie:102
ZADD movie:popularity 1500 movie:103
```

Retrieve members in ascending score order:

``` redis
ZRANGE movie:popularity 0 -1 WITHSCORES
```

Retrieve the highest-ranked movies first:

``` redis
ZREVRANGE movie:popularity 0 -1 WITHSCORES
```

Modern Redis versions also provide `ZRANGE` with the `REV` option for
reverse ordering:

``` redis
ZRANGE movie:popularity 0 -1 REV WITHSCORES
```

Increase a movie's score:

``` redis
ZINCRBY movie:popularity 10 movie:101
```

### 11.2 How is it different from a Set?

  Set                     Sorted set
  ----------------------- ---------------------------------------
  Members are unique      Members are unique
  No score-based order    Every member has a score
  Useful for membership   Useful for rankings
  Membership queries      Membership plus range/ranking queries

### 11.3 Real-world applications

-   Gaming leaderboards.
-   Top trending movies.
-   Popular products.
-   Delayed jobs ordered by due time.
-   Event scheduling.
-   Priority-based ranking.

One caution: scores are floating-point numbers. For applications
requiring exact monetary values, don't use floating-point scores as your
authoritative financial representation.

------------------------------------------------------------------------

## 12. Streams --- append-only event records

Redis Streams are designed to store an ordered sequence of entries, each
with a unique stream entry ID and fields.

### 12.1 Add and read stream entries

``` redis
XADD orders:events * orderId 1001 status CREATED
XADD orders:events * orderId 1002 status CREATED
```

Each `XADD` creates a new entry. The `*` tells Redis to generate the
entry ID.

Read entries:

``` redis
XRANGE orders:events - +
```

The `-` and `+` bounds mean the beginning and end of the stream.

### 12.2 Consumer groups

Streams can also use consumer groups. A consumer group lets several
workers share work while Redis tracks which messages have been delivered
and which still need acknowledgement.

Create a group:

``` redis
XGROUP CREATE orders:events order-workers 0 MKSTREAM
```

Read messages as a named consumer:

``` redis
XREADGROUP GROUP order-workers worker-1 COUNT 10 BLOCK 5000 STREAMS orders:events >
```

This is shown on multiple lines for readability in some documentation;
when using `redis-cli`, you can enter the command on one line.

The `>` marker asks for new entries that have not yet been delivered to
another consumer in that group.

The consumer acknowledges successfully processed messages:

``` redis
XACK orders:events order-workers <entry-id>
```

Replace `<entry-id>` with the actual stream entry ID returned by Redis.

Consumer groups track delivered but unacknowledged entries. Pending
entries can be inspected and reclaimed when a consumer fails. For
example, `XPENDING` can inspect pending messages, and `XAUTOCLAIM` can
help transfer ownership of sufficiently idle pending entries on
supported Redis versions.

### 12.3 Why is this important?

Redis Streams provide more messaging functionality than a simple list
queue. They support:

-   Ordered event records.
-   Multiple independent consumer groups.
-   Message acknowledgement.
-   Tracking pending messages.
-   Reprocessing and recovery workflows.

Applications still need to handle retries, duplicate processing,
retention, and failures correctly. Acknowledgement does not mean the
business operation is automatically exactly-once.

### 12.4 Is Redis Streams the same as Kafka?

No.

  -----------------------------------------------------------------------
  Redis Streams                       Apache Kafka
  ----------------------------------- -----------------------------------
  Part of Redis                       Dedicated distributed
                                      event-streaming platform

  Useful for Redis-centric messaging  Designed for large-scale, durable
  and workflows                       event streams

  Consumer groups and pending-entry   Consumer groups and offset-based
  tracking                            consumption

  Retention and durability depend on  Configurable retention, replication
  Redis configuration                 and log storage

  Can be convenient for lightweight   Often preferred for large event
  background processing               pipelines and long-term replay
  -----------------------------------------------------------------------

Redis Streams may be enough for a modest asynchronous workflow. Kafka
can be a better fit when you need large-scale event distribution, longer
retention, replay, and independent stream-processing infrastructure.

------------------------------------------------------------------------

## 13. Bitmaps --- compact flags

A bitmap uses individual bits to represent Boolean states (true/false,
1/0).

Imagine tracking whether each user logged in on a particular day. Each
user ID can map to a bit position.

``` redis
SETBIT login:2026-10-13 501 1
GETBIT login:2026-10-13 501
GETBIT login:2026-10-13 502
```

If user 501 logged in, the last command for position 501 returns `1`. If
user 502 has not been marked as logged in, its bit returns `0`.

Count how many bits are set:

``` redis
BITCOUNT login:2026-10-13
```

### Use cases

-   Daily active user tracking.
-   Feature flags at scale.
-   Attendance records.
-   Compact binary state tracking.

A bitmap can be memory-efficient when you have many indexed Boolean
values. However, a very large bit offset can create a large underlying
string, so the index design matters. Mapping a user ID directly to a bit
position works best when the IDs and the expected range are suitable for
that approach.

------------------------------------------------------------------------

## 14. HyperLogLog --- approximate unique counting

Suppose your application receives 10 million page visits in a day. You
want to estimate how many unique visitors you had.

Using a set of all visitor IDs gives an exact answer, but storing every
ID can consume substantial memory.

HyperLogLog estimates **cardinality**, or the number of unique elements,
using a small, fixed-size representation per key.

### Example

``` redis
PFADD visitors:2026-10-13 user:1 user:2 user:3 user:1
PFCOUNT visitors:2026-10-13
```

`PFCOUNT` returns an approximate unique count.

Redis's HyperLogLog implementation typically has a standard error of
around 0.81% under its normal operating assumptions.

### Use cases

-   Unique website visitors.
-   Approximate unique API clients.
-   Unique product viewers.
-   Large-scale analytics where a small counting error is acceptable.

**Important:** HyperLogLog cannot tell you which users visited. It
estimates a count, not the actual list of unique members. Use a set or
another data store if you need the actual member list.

------------------------------------------------------------------------

## 15. Geospatial --- locations and distances

Redis geospatial commands store coordinates and let you search for
nearby locations.

Imagine an application that finds nearby theatres or restaurants. The
coordinate format is **longitude followed by latitude**.

### Example: Store locations

``` redis
GEOADD theatres:locations 72.8777 19.0760 mumbai-theatre
GEOADD theatres:locations 77.2090 28.6139 delhi-theatre
```

Find locations within a specified radius using `GEOSEARCH`:

``` redis
GEOSEARCH theatres:locations FROMLONLAT 72.8777 19.0760 BYRADIUS 10 km WITHDIST
```

Again, these commands can be entered on a single line in `redis-cli`.
This example uses a radius of 10 km around the Mumbai coordinates.

### Use cases

-   Nearby theatres.
-   Nearby delivery partners.
-   Store locator systems.
-   Drivers near a pickup point.
-   Geographic filtering.

Redis geospatial features are useful for proximity lookups, but complex
geographic analysis may still require a dedicated spatial database such
as PostGIS.

------------------------------------------------------------------------

## 16. Inspecting a key's data type and expiry

### 16.1 Check a key's data type

Redis provides a direct command for this:

``` redis
TYPE user:501
```

Possible results include `string`, `hash`, `list`, `set`, `zset`, and
`stream`. Other types have corresponding responses, depending on the
Redis version.

This is useful when debugging an existing Redis instance because Redis
commands are type-specific. For example, trying `HGET` on a string key
returns a `WRONGTYPE` error.

### 16.2 Inspect a key's expiry

``` redis
TTL movie:101:response
```

The result indicates the remaining time in seconds. A negative result
has special meaning:

-   `-1` typically means the key exists without an expiry.
-   `-2` means the key does not exist.

For millisecond precision, use:

``` redis
PTTL movie:101:response
```

### 16.3 Set, change, or remove an expiry

Set a key with a 60-second expiry:

``` redis
SET demo:key "hello" EX 60
```

Set expiry on an existing key:

``` redis
EXPIRE demo:key 120
```

Remove expiry so the key no longer has a TTL:

``` redis
PERSIST demo:key
```

Delete a key:

``` redis
DEL demo:key
```

A key without an expiry can remain until it is deleted, evicted, or
removed for another reason. For cache entries, a TTL is often helpful,
but the right duration depends on how frequently the underlying data
changes.

------------------------------------------------------------------------

## 17. Key naming and TTL basics

Redis keys are identifiers. Names such as `user:501` and
`movie:101:details` are conventions chosen by the application; the colon
has no special structural meaning to Redis.

Examples:

``` text
user:501
movie:101:details
session:abc123
rate-limit:user:501
crm:unity:customer:501
crm:indusind:customer:501
```

A consistent naming scheme helps teams understand which service or
tenant owns a key. Separating keys by tenant in the name is not, by
itself, a security boundary. Access controls and deployment design are
still necessary.

### Time to live (TTL)

TTL means how long a key has left before it expires.

``` redis
SET otp:user:501 "728194" EX 300
TTL otp:user:501
```

Here, the key expires after five minutes. TTL is useful for temporary
tokens, sessions, and cache entries.

For sensitive values such as OTPs, expiry is only one requirement. The
application must also validate the value, associate it with the correct
user or action, and handle single-use requirements where needed.

------------------------------------------------------------------------

## 18. Practical caching pattern: cache-aside

One common Redis caching pattern is called **cache-aside**, also known
as lazy loading.

1.  The application checks Redis.
2.  If the key exists, it returns the cached value.
3.  If the key is missing, the application reads from the database.
4.  The application stores the result in Redis, often with a TTL.
5.  The application returns the result.

Example flow:

``` text
Client requests movie 101
          |
          v
   Check Redis key
      /       \
    Hit       Miss
     |          |
Return data   Query MySQL
                |
                v
          Store in Redis
                |
                v
            Return data
```

This pattern is straightforward and avoids loading data into the cache
until it is needed.

### What happens when the movie is updated?

A common approach is:

1.  Update the record in MySQL.
2.  Delete the corresponding Redis cache key.
3.  Let the next read repopulate the cache from MySQL.

``` redis
DEL movie:101:response
```

This is called cache invalidation. The next request becomes a cache miss
and fetches the updated record.

There can be race conditions if one request reads old data while another
updates the database and invalidates the cache. For systems where stale
data is costly, use a carefully designed consistency strategy rather
than assuming deletion alone solves every race.

------------------------------------------------------------------------

## 19. Common caching problems

  -----------------------------------------------------------------------
  Problem                 What happens            Possible mitigation
  ----------------------- ----------------------- -----------------------
  Cache penetration       Repeated requests for   Validate input, or
                          missing records go to   briefly cache negative
                          the database            results where
                                                  appropriate

  Cache avalanche         Many keys expire or     Add random variation to
                          become unavailable      TTLs, stagger
                          around the same time    refreshes, plan
                                                  fallback capacity

  Cache stampede          Many requests           Request coalescing,
                          regenerate the same     refresh-ahead,
                          missing key             carefully designed
                          simultaneously          locking

  Hot key                 One key receives a      Local caching, redesign
                          disproportionately      access patterns,
                          large amount of traffic distribute work where
                                                  possible

  Stale data              Cache contains an old   TTLs, invalidation,
                          value after the source  versioning, or
                          changes                 event-driven updates
  -----------------------------------------------------------------------

These issues matter because a cache should improve the system rather
than become a new source of outages.

------------------------------------------------------------------------

## 20. Redis versus Kafka

Redis Streams and Apache Kafka can both support asynchronous processing,
but they are built for different operating needs.

-   Redis Streams are part of Redis and can be convenient when the
    application already uses Redis for data and lightweight message
    workflows.
-   Kafka is a dedicated event-streaming platform often used for
    high-volume event distribution, longer retention, replay, and
    independent consumer applications.

Choose based on throughput, retention, recovery, operational needs, and
the consequences of losing or duplicating messages. Neither system
automatically makes business processing exactly-once; the application
still needs safe processing and retry behavior.

------------------------------------------------------------------------

## 21. Quick command reference

  Need                           Command
  ------------------------------ ----------------------------------------
  Store a string                 `SET key value`
  Read a string                  `GET key`
  Store multiple values          `MSET key1 value1 key2 value2`
  Read multiple values           `MGET key1 key2`
  Increment a counter            `INCR key`
  Set a value with expiry        `SET key value EX seconds`
  Set only if missing            `SET key value NX`
  Create/update hash fields      `HSET key field value`
  Read a hash field              `HGET key field`
  Read a complete hash           `HGETALL key`
  Add to a list                  `LPUSH key value` or `RPUSH key value`
  Read a list range              `LRANGE key start stop`
  Add unique set members         `SADD key member`
  Check set membership           `SISMEMBER key member`
  Add a scored member            `ZADD key score member`
  Read sorted-set members        `ZRANGE key start stop WITHSCORES`
  Add a stream event             `XADD stream * field value`
  Check data type                `TYPE key`
  Check expiry                   `TTL key`
  Check expiry in milliseconds   `PTTL key`
  Change expiry                  `EXPIRE key seconds`
  Remove expiry                  `PERSIST key`
  Delete a key                   `DEL key`

------------------------------------------------------------------------

## 22. Safety and good practices

1.  **Do not treat every Redis key as disposable cache data.** First
    decide whether Redis holds a copy of database data or important
    application state.
2.  **Set TTLs intentionally.** Very short TTLs can increase database
    traffic; very long TTLs can leave stale data for longer.
3.  **Use the right data type.** Sets are for unique membership; sorted
    sets are for scored ranking; hashes are for flat field-value
    objects.
4.  **Avoid careless full-key scans in production.** Commands such as
    `KEYS *` can block normal work on large datasets. Prefer `SCAN` for
    incremental key iteration when appropriate, while remembering that
    scans can return duplicates and are not a consistent snapshot.
5.  **Handle cache failures.** Decide whether requests can fall back to
    the database, and protect the database from a sudden rush of
    fallback traffic.
6.  **Do not expose Redis directly to untrusted networks.** Use network
    restrictions, authentication, TLS where appropriate, and
    least-privilege access.
7.  **Avoid storing sensitive information unnecessarily.** Apply
    suitable access control, expiry, and data-handling policies.
8.  **Measure before optimizing.** Watch cache hit rate, memory use,
    evictions, latency, and database load.
9.  **Remember that Redis commands are type-specific.** A wrong command
    for a key's data type can produce a `WRONGTYPE` error.
10. **Use durable systems for requirements that need them.** Redis
    persistence and replication are useful, but the correct durability
    design depends on the importance of the data and the failures the
    system must survive.

------------------------------------------------------------------------

## Final summary

Caching avoids repeated work by keeping reusable data closer to the
component that needs it. Redis is a memory-oriented data store that
offers several built-in data structures, allowing applications to do
more than simply store and retrieve strings.

For a beginner learning Redis with backend services, a useful learning
order is:

1.  Understand caching and cache-aside.
2.  Practice strings, `SET`, `GET`, counters, and TTL.
3.  Learn hashes for field-based data.
4.  Learn lists and sets.
5.  Learn sorted sets for rankings.
6.  Explore Streams for asynchronous processing.
7.  Learn the remaining types and common production problems.

The most important skill is not memorizing commands. It is choosing the
right data structure, understanding how the data changes, and deciding
what should happen when the cache expires, becomes stale, or is
unavailable.
