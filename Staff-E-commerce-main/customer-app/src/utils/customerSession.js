// All shared account-storage writes use the same queue. A logout is queued
// after any write already in progress and before a subsequent login's write.
export function createCustomerSession() {
  let generation = 0;
  let token = "";
  let queue = Promise.resolve();
  const capture = () => ({ generation, token });
  const isCurrent = session => session.generation === generation && session.token === token;
  const run = operation => {
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  };
  return {
    capture,
    isCurrent,
    begin(nextToken = "") { generation += 1; token = nextToken; return capture(); },
    run,
    write(session, operation) {
      return run(async () => {
        if (!isCurrent(session)) return false;
        await operation();
        return isCurrent(session);
      });
    },
  };
}

export async function loadCustomerProfile(fetcher, url, token, cachedProfile) {
  try {
    const response = await fetcher(url, { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 401 || response.status === 403) {
      const error = new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
      error.invalidSession = true;
      throw error;
    }
    if (!response.ok) throw new Error("Không tải được tài khoản.");
    return { profile: await response.json(), offline: false };
  } catch (error) {
    if (error.invalidSession || !cachedProfile) throw error;
    return { profile: cachedProfile, offline: true };
  }
}

export function normalizeVietnamesePhone(value) {
  let phone = String(value || "").trim().replace(/[\s().-]/g, "");
  if (phone.startsWith("+84")) phone = `0${phone.slice(3)}`;
  else if (phone.startsWith("84")) phone = `0${phone.slice(2)}`;
  return phone;
}

export function deliveryRecipient(customer) {
  return { fullName: customer.fullName || "", phone: customer.phone || "" };
}
