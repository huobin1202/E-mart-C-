import { useEffect, useRef } from "react";
import * as signalR from "@microsoft/signalr";
import { BASE_URL, getAuthToken } from "../api/apiClient";

const hubUrl = `${BASE_URL.replace(/\/api\/?$/, "")}/hub/notifications`;

/** Authenticated SignalR subscription. Handlers can change without reconnecting. */
export function useRealtimeNotifications(handlers = {}) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    let disposed = false;
    let retryTimer = null;
    let retryDelayMs = 1000;
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl, { accessTokenFactory: () => getAuthToken() || "" })
      .withAutomaticReconnect()
      .build();

    const events = ["CustomerCreated", "CustomerUpdated", "NewOrderPlaced", "OrderStatusChanged", "StockUpdated", "StockReserved"];
    for (const eventName of events) {
      connection.on(eventName, (payload) => handlersRef.current[eventName]?.(payload));
    }
    const startWithRetry = async () => {
      while (!disposed) {
        try {
          await connection.start();
          if (!disposed) console.info("Realtime notifications connected.");
          return;
        } catch (error) {
          if (disposed) return;
          console.warn(`Realtime connection failed; retrying in ${retryDelayMs}ms:`, error.message);
          await new Promise((resolve) => {
            retryTimer = window.setTimeout(resolve, retryDelayMs);
          });
          retryTimer = null;
          retryDelayMs = Math.min(retryDelayMs * 2, 15000);
        }
      }
    };
    void startWithRetry();
    return () => {
      disposed = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      void connection.stop();
    };
  }, []);
}
