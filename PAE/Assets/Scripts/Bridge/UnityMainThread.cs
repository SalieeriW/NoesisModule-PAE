using System;
using System.Collections.Concurrent;
using UnityEngine;

/// <summary>
/// Queues actions from background threads and drains them on the Unity main thread each Update.
/// Place this on any persistent GameObject (e.g. the BridgeServer GameObject).
/// </summary>
public class UnityMainThread : MonoBehaviour
{
    private static UnityMainThread _instance;
    private static readonly ConcurrentQueue<Action> _queue = new ConcurrentQueue<Action>();

    void Awake()
    {
        _instance = this;
    }

    void Update()
    {
        while (_queue.TryDequeue(out Action action))
            action?.Invoke();
    }

    /// <summary>Enqueue an action to run on the main thread next Update.</summary>
    public static void Run(Action action)
    {
        _queue.Enqueue(action);
    }
}
