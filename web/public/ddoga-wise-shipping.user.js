// ==UserScript==
// @name         DDOGA Wise shipping bridge
// @namespace    https://www.ddoga.lol/
// @version      2.4.14
// @updateURL    https://www.ddoga.lol/ddoga-wise-shipping.user.js
// @downloadURL  https://www.ddoga.lol/ddoga-wise-shipping.user.js
// @match        https://wyyyes.com/*
// @run-at       document-start
// @grant        none
// @sandbox      raw
// @noframes
// ==/UserScript==

(() => {
  const origin = "https://www.ddoga.lol";

  const norm = x => String(x || "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .toLowerCase();

  const digits = x =>
    String(x || "").replace(/\D/g, "");

  const wait = ms =>
    new Promise(resolve => setTimeout(resolve, ms));

  // raw(page) 컨텍스트: Firefox 모바일의 cross-realm fetch/XHR 충돌 방지.
  const page = window;
  if (page.__DDOGA_WISE_SHIP_V2414__) return;
  page.__DDOGA_WISE_SHIP_V2414__ = true;

  const hasOpener = () => {
    try { return Boolean(window.opener && !window.opener.closed); }
    catch (_) { return false; }
  };

  let matches = [];
  let authHeader = "";
  let authVersion = 0;
  let apiSeen = 0;
  let cookieOK = false;
  let hookError = "";
  let phase = "와이스 로딩 대기";
  let hookMode = "미설치";
  let badge;
  // 문서가 다시 로드되면 새로운 인스턴스가 생성되어 DDOGA가 재접속을 구분합니다.
  const pageInstance = String(Date.now()) + '-' + Math.random().toString(36).slice(2);
  let activePrepToken = '';
  let prepPostedVirtualNumber = false;
  let prepReconnectRequested = false;

  // 배송기한 스냅샷 인증 만료 자동복구
  let activeSnapshotRequest = false;
  let snapshotReconnectRequested = false;
  let snapshotResumeBusy = false;
  const SNAPSHOT_RESUME_KEY = "ddoga:wise:snapshot-resume:v1";

  const markSnapshotResume = () => {
    try { sessionStorage.setItem(SNAPSHOT_RESUME_KEY, "1"); } catch (_) {}
  };

  const clearSnapshotResume = () => {
    try { sessionStorage.removeItem(SNAPSHOT_RESUME_KEY); } catch (_) {}
  };

  const hasSnapshotResume = () => {
    try { return sessionStorage.getItem(SNAPSHOT_RESUME_KEY) === "1"; }
    catch (_) { return false; }
  };
  // 와이스 앱에서 이미 받은 정상 미발송 목록을 재사용한다.
  // 앱 응답을 변경하지 않으며, 오래된 캐시는 사용하지 않는다.
  let buyerListCache = null;
  let buyerListTime = 0;
  const BUYER_LIST_PATH = "/r0.app/sellers/myMarket/buyers/undeliveredUsers";
  const cacheBuyerList = json => {
    if (!Array.isArray(json?.result)) return;
    buyerListCache = json.result;
    buyerListTime = Date.now();
  };
  const freshBuyerList = () =>
    buyerListCache && (Date.now() - buyerListTime < 60000) ? buyerListCache : null;

  const wiseUserIdOf = user => String(
    user?._id || user?.userId || user?.user?._id || ""
  ).trim();

  const wiseNicknameOf = user => String(
    user?.nickname || user?.user?.nickname || ""
  ).trim();

  function resolveWiseBuyer(users, row) {
    const wantedId = String(row?.wise_user_id || row?.user_id || "").trim();

    if (wantedId) {
      const byId = users.filter(user => wiseUserIdOf(user) === wantedId);

      if (byId.length === 1) {
        return {
          user: byId[0],
          userId: wantedId,
          matchedBy: "id",
          count: 1
        };
      }

      // 고유 ID가 이미 있으면 닉네임이 우연히 같은 다른 사람으로 대체하지 않는다.
      // 미발송 목록에서 이미 사라진 경우에도 orderChains는 ID로 직접 조회 가능하다.
      return {
        user: null,
        userId: wantedId,
        matchedBy: "id",
        count: byId.length
      };
    }

    const byName = users.filter(user =>
      norm(wiseNicknameOf(user)) === norm(row?.nickname)
    );

    if (byName.length !== 1) {
      return {
        user: null,
        userId: "",
        matchedBy: "nickname",
        count: byName.length
      };
    }

    return {
      user: byName[0],
      userId: wiseUserIdOf(byName[0]),
      matchedBy: "nickname",
      count: 1
    };
  }

  const originalFetch = page.fetch;

  function diagnostic() {
    return (
      "DDOGA 2.4.14 · " + phase + "\n" +
      "요청 감지 " + apiSeen +
      " · 인증 " +
      (
        authHeader
          ? "감지됨"
          : cookieOK
            ? "쿠키 확인됨"
            : "미감지"
      ) +
      " · 연결창 " +
      (hasOpener() ? "있음" : "없음") +
      " · 감지 " + hookMode +
      (hookError ? " · " + hookError : "")
    );
  }

  function paint() {
    if (badge) {
      badge.textContent = diagnostic();
    }
  }

  function mountBadge() {
    if (badge || !document.body) return;

    badge = document.createElement("button");
    badge.type = "button";
    badge.style.cssText =
      "position:fixed;" +
      "bottom:8px;" +
      "left:8px;" +
      "z-index:2147483647;" +
      "max-width:94vw;" +
      "padding:8px 10px;" +
      "background:#111827;" +
      "color:white;" +
      "border:1px solid #84cc16;" +
      "border-radius:8px;" +
      "font:12px sans-serif;" +
      "white-space:pre-line;" +
      "text-align:left";

    badge.addEventListener("click", () => {
      window.alert(
        diagnostic() +
        "\n인증 미감지라면 자동 재연결이 실패하면 와이스 로그인 상태를 확인해줘." +
        "\n인증값은 표시하거나 외부로 보내지 않아."
      );
    });

    document.body.appendChild(badge);
    paint();
  }

  // React 초기 화면이 생성되는 동안 body에 UI를 삽입하지 않음.
  function showBadgeWhenReady() {
    setTimeout(mountBadge, 700);
  }

  if (document.readyState === "complete") {
    showBadgeWhenReady();
  } else {
    window.addEventListener("load", showBadgeWhenReady, { once: true });
  }

  const apiURL = input => {
    try {
      const candidate = typeof input === "string" || input instanceof URL
        ? String(input)
        : input && input.url;
      if (!candidate) return false;
      const url = new URL(candidate, location.href);
      return url.origin === location.origin && url.pathname.startsWith("/r0.app/");
    } catch (_) {
      return false;
    }
  };

  function capture(value) {
    if (value && String(value) !== authHeader) {
      authHeader = String(value);
      authVersion++;
      maybeResumeSnapshot();
    }
    paint();
  }

  // 와이스 앱이 첫 API를 호출하기 전(document-start)에 감지 설치.
  // 2.4.0의 load+1000ms 설치는 초기 Authorization 요청을 놓치는 원인이었음.
  // 일반 와이스 탭에서는 fetch / XMLHttpRequest를 변경하지 않음.
  let hooksInstalled = false;

  function installHooks() {
    if (hooksInstalled) return;

    if (!hasOpener()) {
      phase = "일반 와이스 탭 · 연결 대기";
      hookMode = "사용 안 함";
      paint();
      return;
    }

    try {
      const xhrURLs = new WeakMap();
      const proto = page.XMLHttpRequest.prototype;
      const originalOpen = proto.open;
      const originalSetHeader = proto.setRequestHeader;

      // Firefox에선 exportFunction으로 네이티브 함수 교체 시
      // Promise / Request가 다른 realm에 속해 사이트 오류가 날 수 있음.
      // @grant none + @sandbox raw 에서는 모든 함수가 페이지와 같은 realm.
      page.fetch = function(input, init) {
        let buyerListGet = false;
        try {
          if (apiURL(input)) {
            apiSeen++;
            const sourceHeaders = init && init.headers !== undefined
              ? init.headers
              : input instanceof Request ? input.headers : undefined;
            capture(new Headers(sourceHeaders).get("Authorization"));
            const requestURL = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url, location.href);
            buyerListGet = requestURL.pathname === BUYER_LIST_PATH &&
              String(init?.method || input?.method || "GET").toUpperCase() === "GET";
          }
        } catch (_) { /* 와이스 요청 자체에는 영향 없음 */ }
        const promise = Reflect.apply(originalFetch, page, arguments);
        if (buyerListGet) {
          // 앱이 정상적으로 받은 JSON을 복사해 캐시; 앱의 fetch 응답은 그대로 전달.
          Promise.resolve(promise).then(response => {
            if (response?.ok && typeof response.clone === "function") {
              return response.clone().json().then(cacheBuyerList);
            }
          }).catch(() => {});
        }
        return promise;
      };

      proto.open = function(method, url) {
        try {
          const allowed = apiURL(url);
          xhrURLs.set(this, allowed);
          if (allowed) {
            apiSeen++;
            paint();
            const requestURL = new URL(String(url), location.href);
            if (requestURL.pathname === BUYER_LIST_PATH &&
                String(method).toUpperCase() === "GET") {
              // XHR 기반 앱 요청도 관찰만 하고 기존 XHR 동작은 유지.
              this.addEventListener("load", () => {
                try {
                  if (this.status !== 200) return;
                  const json = this.responseType === "json"
                    ? this.response
                    : JSON.parse(this.responseText);
                  cacheBuyerList(json);
                } catch (_) {}
              }, {once:true});
            }
          }
        } catch (_) { /* 와이스 요청 자체에는 영향 없음 */ }
        return Reflect.apply(originalOpen, this, arguments);
      };

      proto.setRequestHeader = function(name, value) {
        try {
          if (xhrURLs.get(this) && String(name).toLowerCase() === "authorization") {
            capture(value);
          }
        } catch (_) { /* 와이스 요청 자체에는 영향 없음 */ }
        return Reflect.apply(originalSetHeader, this, arguments);
      };

      hooksInstalled = true;
      hookMode = "활성";
      phase = "와이스 연결 준비";
    } catch (error) {
      hookError = "통신 감지 설치 실패: " + String(error?.message || error);
      hookMode = "실패";
    }
    paint();
  }

  // 앱 부팅의 초기 Fetch/XHR 요청을 놓치지 않도록 즉시 설치.
  // load 이후에 설치하면 실제 페이지 API 호출은 이미 끝난 경우가 많음.
  installHooks();

  const send = (type, extra = {}) => {
    if (
      type === "DDOGA_WISE_SHIP_PROGRESS" ||
      type === "DDOGA_WISE_PREP_PROGRESS" ||
      type === "DDOGA_WISE_SNAPSHOT_PROGRESS"
    ) {
      phase = String(extra.message || phase);
    }

    if (type === "DDOGA_WISE_SHIP_RESULT") {
      phase = "처리 결과 수신 완료";
    }

    paint();

    try {
      window.opener?.postMessage(
        { type, ...extra },
        origin
      );
    } catch (_) {}
  };

  function maybeResumeSnapshot() {
    if (
      !hasSnapshotResume() ||
      snapshotResumeBusy ||
      !hasOpener() ||
      !authHeader
    ) {
      return;
    }

    snapshotResumeBusy = true;

    setTimeout(() => {
      void snapshot(true).finally(() => {
        snapshotResumeBusy = false;
      });
    }, 350);
  }

  async function waitForAuth(previousVersion, timeout = 45000) {
    send("DDOGA_WISE_SHIP_PROGRESS", {
      message:
        "와이스 인증 대기 · 연결 복구 중"
    });

    const until = Date.now() + timeout;

    while (Date.now() < until) {
      if (authHeader && authVersion > previousVersion) {
        return authHeader;
      }

      await wait(200);
    }

    phase = "인증 확인 실패";
    paint();

    throw Error(
      "[2.4.14] 인증 미감지 · 페이지 요청 " +
      apiSeen +
      "건" +
      (hookError ? " · Firefox 페이지 연결 실패" : "") +
      ". 와이스 화면 왼쪽 아래 상태를 확인해줘."
    );
  }

  async function request(path, options = {}) {
    if (!apiURL(path)) {
      throw Error("허용되지 않은 API 경로");
    }
    const isPrepBuyerList = Boolean(activePrepToken && path === '/r0.app/sellers/myMarket/buyers/undeliveredUsers');
    const listProgress = message => {
      if (isPrepBuyerList && activePrepToken) {
        send('DDOGA_WISE_PREP_PROGRESS', {token: activePrepToken, message});
      }
    };

    async function attempt() {
      listProgress('선택 구매자 목록 API 호출 중...');
      const headers = new Headers(options.headers || {});

      headers.set("Content-Type", "application/json");

      if (authHeader) {
        headers.set("Authorization", authHeader);
      }

      // raw 컨텍스트는 별도 cloneInto 없이 페이지 기본 Request 객체 사용.
      const requestOptions = {
        ...options,
        headers,
        credentials: "include"
      };

      const controller = new page.AbortController();
      requestOptions.signal = controller.signal;

      let timer;
      const cutoff = new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(Error("와이스 API 응답 20초 초과: " + path.split("?")[0]));
        }, 20000);
      });

      try {
        // HTTP 200 뒤 본문 수신이 멈추어도 정해진 시간 내 실패로 종료.
        const operation = (async () => {
          const response = await originalFetch.call(
            page,
            new URL(path, location.href).href,
            requestOptions
          );
          listProgress('미발송 목록 HTTP ' + response.status + ' · 응답 본문 수신 중...');
          const raw = await response.text();
          return {response, raw};
        })();
        const {response, raw} = await Promise.race([operation, cutoff]);
        listProgress('미발송 목록 수신 완료 (' + raw.length.toLocaleString() + '자) · JSON 분석 중...');
        let json = null;

        try {
          json = JSON.parse(raw);
        } catch (_) {}
        listProgress(json === null
          ? '미발송 목록 JSON 분석 실패 · 응답 형식 확인 필요'
          : '미발송 목록 JSON 분석 완료 · 구매자 대조 중...');

        return { response, json, raw };
      } catch (error) {
        if (error.name === "AbortError") {
          throw Error(
            "와이스 응답 시간 초과. 실제 등록 여부를 확인한 뒤 재시도해줘."
          );
        }

        throw error;
      } finally {
        clearTimeout(timer);
      }
    }

    const version = authVersion;
    let result = await attempt();

    if (result.response.status === 401) {
      // 그 사이 앱이 신규 인증 헤더를 보냈다면 새 값으로 조회를 한 번만 재시도.
      if (authHeader && authVersion > version) {
        result = await attempt();
      }
      if (result.response.status === 401 && activeSnapshotRequest) {
        const method = String(options.method || "GET").toUpperCase();

        if (method === "GET") {
          if (!snapshotReconnectRequested) {
            snapshotReconnectRequested = true;
            markSnapshotResume();
            phase = "배송기한 인증 갱신 중 · 와이스 자동 새로고침";

            send("DDOGA_WISE_SHIP_PROGRESS", {
              message: "배송기한 인증이 만료돼 와이스를 자동 새로고침하고 다시 조회할게."
            });

            setTimeout(() => {
              try { window.location.reload(); }
              catch (error) {
                console.warn("[DDOGA WISE] 배송기한 인증 새로고침 실패:", error);
              }
            }, 180);
          }

          const error = new Error("배송기한 인증 자동 갱신 중");
          error.ddogaSnapshotReconnect = true;
          throw error;
        }
      }

      if (result.response.status === 401 && activePrepToken) {
        const method = String(options.method || "GET").toUpperCase();
        if (method === "GET" && !prepPostedVirtualNumber) {
          // GET 인증 실패일 때만 재연결: 일회성 안심번호 발급 POST는 자동 반복하지 않음.
          if (!prepReconnectRequested) {
            prepReconnectRequested = true;
            phase = "인증 갱신 중 · 와이스 자동 새로고침";
            send("DDOGA_WISE_PREP_RECONNECT", {
              token: activePrepToken,
              instance: pageInstance
            });
            setTimeout(() => {
              try { window.location.reload(); }
              catch (error) { console.warn("[DDOGA WISE] 자동 새로고침 실패:", error); }
            }, 180);
          }
          const error = new Error("와이스 인증 연결 자동 갱신 중");
          error.ddogaPrepReconnect = true;
          throw error;
        }
        // POST 재시도는 신규 안심번호 열람이 중복될 수 있으므로 하지 않음.
        throw Error("와이스 인증 오류(401). 발급 여부가 불확실하여 자동 재요청하지 않았어.");
      }
      if (result.response.status === 401) {
        await waitForAuth(version);
        result = await attempt();
      }
    }

    const { response, json, raw } = result;

    if (!response.ok) {
      const error = new Error(
        "HTTP " + response.status + ": " +
        (
          response.status === 401
            ? "와이스 로그인을 다시 확인해줘."
            : String(json?.message || json?.error || "API 오류")
        )
      );

      error.status = response.status;
      error.data = json;
      error.raw = raw || "";
      error.url = response.url;
      throw error;
    }

    if (json === null) {
      throw Error(
        "와이스가 JSON 대신 다른 응답을 보냈어. 로그인 상태를 확인해줘."
      );
    }

    if (!authHeader) {
      cookieOK = true;
    }

    paint();
    return json;
  }

  // 합배송 확인 버튼
  const clicked = new WeakSet();

  const bulkLabel =
    /^일괄\s*발송\s*완료\s*처리\s*\(\s*총\s*\d+\s*건\s*\)$/;

  function findBulkButton() {
    const nodes = document.querySelectorAll(
      'div[tabindex="0"], button, [role="button"]'
    );

    for (const el of nodes) {
      const text = String(el.innerText || el.textContent || "")
        .replace(/\s+/g, " ")
        .trim();

      if (!bulkLabel.test(text) || clicked.has(el)) {
        continue;
      }

      const rect = el.getBoundingClientRect();

      if (rect.width > 0 && rect.height > 0) {
        return el;
      }
    }

    return null;
  }

  async function confirmIfAppears(timeout = 12000) {
    const until = Date.now() + timeout;

    while (Date.now() < until) {
      const button = findBulkButton();

      if (button) {
        clicked.add(button);
        button.click();

        console.log(
          "[DDOGA WISE] 일괄 발송 완료 처리 버튼 클릭"
        );

        return true;
      }

      await wait(150);
    }

    return false;
  }

  // 등록 전/후 읽기 전용 재확인.
  // 동일 송장은 구매자의 전체 배송에서 찾고, 선택 배송 ID에 다른 송장이 있으면 덮어쓰지 않는다.
  async function readDeliveryState(match, cleanCode) {
    const response = await request(
      "/r0.app/sellers/myMarket/orderChains?userId=" +
      encodeURIComponent(match.user_id)
    );

    if (!Array.isArray(response.result)) {
      throw Error("와이스 배송 조회 형식 오류");
    }

    const chains = response.result;

    const selectedRows = chains.filter(chain =>
      Number(chain.delivery_id) === Number(match.delivery_id)
    );

    const selectedCodes = [
      ...new Set(
        selectedRows
          .map(row => digits(row.deliveryCode))
          .filter(Boolean)
      )
    ];

    if (selectedCodes.some(code => code !== cleanCode)) {
      throw Error(
        "해당 배송 ID에 다른 송장번호가 이미 있어. 자동 덮어쓰기 중단"
      );
    }

    const same = chains.find(row =>
      Number(row.delivery_id) > 0 &&
      Number(row.status) === 25 &&
      String(row.deliveryCompany || "").toUpperCase() === "LOGEN" &&
      digits(row.deliveryCode) === cleanCode
    ) || null;

    const active = chains.filter(row =>
      Number(row.delivery_id) > 0 &&
      !row.deliveryCode &&
      Number(row.status) !== 25
    );

    return {
      chains,
      registered: Boolean(same),
      registeredRow: same,
      active,
      activeIds: [
        ...new Set(
          active.map(row => Number(row.delivery_id))
        )
      ]
    };
  }

  async function verifyDelivery(
    match,
    cleanCode,
    timeout = 20000
  ) {
    const until = Date.now() + timeout;
    let lastError = "";

    while (Date.now() < until) {
      try {
        const state =
          await readDeliveryState(
            match,
            cleanCode
          );

        if (state.registered) {
          if (state.registeredRow) {
            match.delivery_id =
              Number(
                state.registeredRow.delivery_id
              );

            match.cursor_order_chain_id =
              Number(
                state.registeredRow.firstOrderGroupId
              ) ||
              match.cursor_order_chain_id;
          }

          return true;
        }

      } catch (error) {
        lastError =
          String(
            error.message ||
            error
          );

        if (
          lastError.includes(
            "다른 송장번호"
          )
        ) {
          throw error;
        }
      }

      await wait(1000);
    }

    if (lastError) {
      console.warn(
        "[DDOGA WISE] 등록 확인 오류:",
        lastError
      );
    }

    return false;
  }

  function visible(el) {
    if (!el) return false;

    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function exactBuyerRows(nickname) {
    const target = norm(nickname);
    if (!target) return [];

    const rows = [
      ...document.querySelectorAll('div[tabindex="0"]')
    ].filter(row => {
      if (!visible(row)) return false;

      const labels = [
        ...row.querySelectorAll("img[alt]")
      ].map(img => img.alt);

      const names = [
        ...row.querySelectorAll('[dir="auto"]')
      ].map(el => el.textContent || "");

      return [...labels, ...names].some(label =>
        norm(label).includes(target)
      );
    });

    const innermost = rows.filter(row =>
      !rows.some(other =>
        other !== row && row.contains(other)
      )
    );

    return innermost.length ? innermost : rows;
  }

  // 412(추가 주문) UI 처리 이후 구매자 상세 화면에 남는 문제 방지.
  // 이동이 확인되지 않으면 다른 구매자에게 송장을 잘못 입력하지 않도록 중단한다.
  const WISE_BUYER_LIST = "/shipping-waiting-user-list";
  const inBuyerList = () => location.pathname.replace(/\/$/, "") === WISE_BUYER_LIST;

  async function ensureBuyerList() {
    if (inBuyerList()) return;
    if (!location.pathname.startsWith("/delivery-list-by-user/")) {
      throw Error("와이스 미발송 목록이 아님: " + location.pathname);
    }
    send("DDOGA_WISE_SHIP_PROGRESS", {
      message: "구매자 상세 페이지에서 미발송 목록으로 복귀 중..."
    });
    // 와이스 SPA 내 링크가 있으면 링크로, 없으면 상세 진입 직전의 히스토리로 이동.
    const listLink = [...document.querySelectorAll('a[href]')]
      .find(a => {
        try { return new URL(a.href, location.href).pathname.replace(/\/$/, "") === WISE_BUYER_LIST; }
        catch (_) { return false; }
      });
    if (listLink) listLink.click();
    else window.history.back();

    const until = Date.now() + 12000;
    while (Date.now() < until) {
      if (inBuyerList()) {
        await wait(350); // 라우터가 목록 컴포넌트를 렌더링할 여유
        return;
      }
      await wait(200);
    }
    throw Error("미발송 목록 복귀 실패 (현재 " + location.pathname + "). 수동으로 목록을 열고 다시 실행해줘.");
  }

  async function uiRegisterAfter412(match, cleanCode) {
    const chainResponse = await request(
      "/r0.app/sellers/myMarket/orderChains?userId=" +
      encodeURIComponent(match.user_id)
    );

    const chains = Array.isArray(chainResponse.result)
      ? chainResponse.result
      : [];

    const activeIds = [
      ...new Set(
        chains.filter(chain =>
          Number(chain.delivery_id) > 0 &&
          !chain.deliveryCode &&
          Number(chain.status) !== 25
        ).map(chain => Number(chain.delivery_id))
      )
    ];

    if (!activeIds.includes(Number(match.delivery_id))) {
      throw Error(
        "선택한 배송 ID가 미발송 목록에 없어. 다시 미리보기를 실행해줘."
      );
    }

    // 반드시 미발송 구매자 목록에서만 선택한다. 상세 화면에서 다른 사람을 탐색하지 않는다.
    await ensureBuyerList();
    let buyers = exactBuyerRows(match.nickname);

    if (!buyers.length) {
      for (
        let attempt = 0;
        attempt < 20 && !buyers.length;
        attempt++
      ) {
        await wait(250);
        buyers = exactBuyerRows(match.nickname);
      }
    }

    if (!buyers.length) {
      const visibleNames = [
        ...document.querySelectorAll("img[alt]")
      ]
        .filter(visible)
        .map(el => el.alt)
        .filter(Boolean)
        .slice(0, 6);

      throw Error(
        "구매자 행 탐색 실패 (" + buyers.length + "개). 현재 화면: " +
        location.pathname +
        " · 화면의 구매자 이미지: " +
        (visibleNames.join(", ") || "없음") +
        ". 와이스 미발송 목록을 열어줘."
      );
    }

    buyers[0].click();

    let input;
    const until = Date.now() + 8000;

    while (Date.now() < until) {
      const candidates = [
        ...document.querySelectorAll('input[placeholder="송장번호"]')
      ].filter(visible);

      if (candidates.length) {
        input = candidates[0];
        break;
      }

      await wait(150);
    }

    if (!input) {
      throw Error(
        "구매자 화면에서 송장 입력칸을 찾지 못했어."
      );
    }

    function findLocalSendButton(field) {
      let parent = field.parentElement;

      while (parent && parent !== document.body) {
        const inputs = [
          ...parent.querySelectorAll('input[placeholder="송장번호"]')
        ].filter(visible);

        const buttons = [
          ...parent.querySelectorAll(
            'div[tabindex="0"], button, [role="button"]'
          )
        ].filter(el =>
          visible(el) &&
          String(el.textContent || "")
            .replace(/\s+/g, " ")
            .trim() === "발송 완료 처리"
        );

        if (
          inputs.length === 1 &&
          inputs[0] === field &&
          buttons.length === 1
        ) {
          return buttons[0];
        }

        if (inputs.length > 1) break;

        parent = parent.parentElement;
      }

      return null;
    }

    const sendButton = findLocalSendButton(input);

    if (!sendButton) {
      throw Error(
        "첫 번째 송장 입력칸에 연결된 발송 완료 처리 버튼을 구분하지 못했어."
      );
    }

    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    ).set;

    setter.call(input, cleanCode);

    input.dispatchEvent(
      new Event("input", { bubbles: true })
    );

    input.dispatchEvent(
      new Event("change", { bubbles: true })
    );

    input.blur();
    await wait(350);

    if (digits(input.value) !== cleanCode) {
      throw Error(
        "송장 입력값이 일치하지 않아 중단했어."
      );
    }

    sendButton.click();

    const confirmed = await confirmIfAppears(10000);

    if (!confirmed) {
      console.warn(
        "[DDOGA WISE] 합배송 확인 팝업 미발견; 최종 등록 여부 재조회"
      );
    }

    return confirmed;
  }

  // 운송장 등록 대상 미리보기
  // Wise 고유 user ID 우선, 과거 주문만 닉네임 fallback.
  async function preview(orders) {
    matches = [];

    try {
      const list =
        await request(
          BUYER_LIST_PATH
        );

      const users =
        Array.isArray(
          list.result
        )
          ? list.result
          : [];

      for (
        const order of
          orders
      ) {
        const match = {
          order_id:
            order.order_id,

          nickname:
            String(
              order.nickname ||
              ""
            ),

          ddoga_nickname:
            String(
              order.nickname ||
              ""
            ),

          wise_user_id:
            String(
              order.wise_user_id ||
              ""
            ).trim() ||
            null,

          tracking_number:
            order.tracking_number,

          status:
            "skip",

          reason:
            "",

          delivery_id:
            0,

          cursor_order_chain_id:
            0,

          matched_by:
            ""
        };

        const resolved =
          resolveWiseBuyer(
            users,
            order
          );

        if (
          !resolved.userId
        ) {
          match.reason =
            resolved.count
              ? "중복 닉네임"
              : "닉네임 없음";

          matches.push(
            match
          );

          continue;
        }

        match.user_id =
          resolved.userId;

        match.matched_by =
          resolved.matchedBy;

        if (
          resolved.user
        ) {
          match.nickname =
            wiseNicknameOf(
              resolved.user
            ) ||
            match.nickname;
        }

        const response =
          await request(
            "/r0.app/sellers/myMarket/orderChains?userId=" +
            encodeURIComponent(
              match.user_id
            )
          );

        const chains =
          Array.isArray(
            response.result
          )
            ? response.result
            : [];

        const cleanCode =
          digits(
            order.tracking_number
          );

        const already =
          chains.find(
            chain =>
              Number(
                chain.delivery_id
              ) > 0 &&
              Number(
                chain.status
              ) === 25 &&
              String(
                chain.deliveryCompany ||
                ""
              ).toUpperCase() ===
                "LOGEN" &&
              cleanCode &&
              digits(
                chain.deliveryCode
              ) === cleanCode
          );

        if (
          already
        ) {
          match.delivery_id =
            Number(
              already.delivery_id
            );

          match.cursor_order_chain_id =
            Number(
              already.firstOrderGroupId
            ) ||
            0;

          match.already_registered =
            true;

          match.status =
            "ready";

          match.reason =
            "Wise 동일 송장 이미 등록됨 · DDOGA 상태만 동기화";

          matches.push(
            match
          );

          continue;
        }

        const active =
          chains.filter(
            chain =>
              Number(
                chain.delivery_id
              ) > 0 &&
              !chain.deliveryCode &&
              Number(
                chain.status
              ) !== 25
          );

        if (
          !active.length
        ) {
          match.reason =
            "등록 가능한 미발송 배송 ID 없음";

          matches.push(
            match
          );

          continue;
        }

        const first =
          active[0];

        match.delivery_id =
          Number(
            first.delivery_id
          );

        match.cursor_order_chain_id =
          Number(
            first.firstOrderGroupId
          );

        if (
          !match.cursor_order_chain_id
        ) {
          match.reason =
            "주문 묶음 ID 없음";

          matches.push(
            match
          );

          continue;
        }

        match.status =
          "ready";

        match.reason =
          active.length > 1
            ? "등록 가능 · 미발송 " +
              active.length +
              "개 중 맨 위 첫 번째 사용"
            : resolved.matchedBy ===
                "id"
              ? "등록 가능 · Wise ID 매칭"
              : "등록 가능 · 닉네임 fallback";

        matches.push(
          match
        );
      }

      const seen =
        new Set();

      for (
        const match of
          matches.filter(
            item =>
              item.status ===
                "ready" &&
              !item.already_registered
          )
      ) {
        if (
          seen.has(
            match.delivery_id
          )
        ) {
          match.status =
            "skip";

          match.reason =
            "동일 배송 중복";
        }

        seen.add(
          match.delivery_id
        );
      }

      send(
        "DDOGA_WISE_SHIP_PREVIEW",
        {
          matches
        }
      );

    } catch (error) {
      send(
        "DDOGA_WISE_SHIP_PREVIEW",
        {
          matches,

          error:
            "와이스 조회 실패: " +
            error.message
        }
      );
    }
  }

  // 실제 운송장 등록
  async function register(ids) {
    const results = [];

    const targets = matches.filter(match =>
      match.status === "ready" &&
      ids.includes(match.order_id)
    );

    if (!targets.length) {
      send("DDOGA_WISE_SHIP_RESULT", {
        results: [{
          nickname: "선택 주문",
          ok: false,
          error:
            "등록 대상이 없어. 미리보기를 다시 실행해줘."
        }]
      });

      return;
    }

    for (const match of targets) {
      let touchedBuyerUI = false;
      try {
        const cleanCode =
          digits(match.tracking_number);

        if (!/^\d{8,}$/.test(cleanCode)) {
          throw Error("송장번호 형식 오류");
        }

        send("DDOGA_WISE_SHIP_PROGRESS", {
          message:
            match.nickname + ": 송장 등록 요청 중..."
        });

        // Wise ID 기준 최신 상태 재확인.
        // 이미 같은 송장이 있으면 재전송하지 않고 DDOGA Y만 복구한다.
        const beforeState =
          await readDeliveryState(
            match,
            cleanCode
          );

        if (
          beforeState.registered
        ) {
          if (
            beforeState.registeredRow
          ) {
            match.delivery_id =
              Number(
                beforeState.registeredRow.delivery_id
              );

            match.cursor_order_chain_id =
              Number(
                beforeState.registeredRow.firstOrderGroupId
              ) ||
              match.cursor_order_chain_id;
          }

          send(
            "DDOGA_WISE_SHIP_PROGRESS",
            {
              message:
                match.nickname +
                ": 와이스에 동일 송장 이미 등록됨 · DDOGA 상태 동기화"
            }
          );

          send(
            "DDOGA_WISE_SHIP_SYNC",
            {
              row: {
                order_id:
                  match.order_id,

                tracking_number:
                  match.tracking_number,

                delivery_id:
                  match.delivery_id,

                wise_user_id:
                  match.user_id ||
                  match.wise_user_id ||
                  null
              }
            }
          );

          results.push({
            order_id:
              match.order_id,

            nickname:
              match.nickname,

            ok:
              true,

            recovered:
              true
          });

          continue;
        }

        if (
          !beforeState.active.length
        ) {
          throw Error(
            "등록 가능한 미발송 배송 ID 없음"
          );
        }

        const current =
          beforeState.active[0];

        match.delivery_id =
          Number(
            current.delivery_id
          );

        match.cursor_order_chain_id =
          Number(
            current.firstOrderGroupId
          );

        if (
          !match.cursor_order_chain_id
        ) {
          throw Error(
            "주문 묶음 ID 없음"
          );
        }

        const url =
          "/r0.app/sellers/myMarket/deliveries" +
          "?cursorOrderChainId=" +
          match.cursor_order_chain_id +
          "&deliveryIds=" +
          match.delivery_id;

        let needsConfirmation = false;
        let patchResult = null;

        try {
          patchResult = await request(url, {
            method: "PATCH",
            body: JSON.stringify({
              deliveryCode: cleanCode,
              deliveryCompany: "LOGEN",
              status: 25
            })
          });
        } catch (error) {
          if (error.status !== 412) {
            throw error;
          }

          needsConfirmation = true;
          match.last_412 = {
            data: error.data || null,
            raw: error.raw || ""
          };

          send("DDOGA_WISE_SHIP_PROGRESS", {
            message:
              match.nickname +
              ": 추가주문(412) 감지, 합배송 확인 버튼 검색 중..."
          });
        }

        if (!needsConfirmation) {
          if (patchResult?.message !== "success") {
            throw Error("와이스 PATCH 응답 실패: " + String(patchResult?.message || "응답 확인 필요"));
          }
          // PATCH 응답에 상세 결과가 없어도 실제 배송 데이터를 GET으로 확인한다.
          const verifiedDirect = await verifyDelivery(match, cleanCode, 20000);
          if (!verifiedDirect) throw Error("와이스 등록 응답 후 배송상태 재조회 불일치. 재전송하지 말고 와이스에서 직접 확인해줘.");
        }

        if (needsConfirmation) {
          send("DDOGA_WISE_SHIP_PROGRESS", {
            message:
              match.nickname +
              ": 412 감지 · 와이스 화면에서 발송 완료 처리 시도 중..."
          });

          if (await verifyDelivery(match, cleanCode, 2500)) {
            send("DDOGA_WISE_SHIP_PROGRESS", {message:match.nickname + ": 412 후 실제 송장 등록 확인됨"});
          } else {
          touchedBuyerUI = true;
          const clickedBulk = await uiRegisterAfter412(
            match,
            cleanCode
          );

          send("DDOGA_WISE_SHIP_PROGRESS", {
            message:
              match.nickname +
              (
                clickedBulk
                  ? ": 일괄 발송 확인 클릭 · 실제 등록 상태 검증 중..."
                  : ": 확인 팝업 미발견 · 실제 등록 상태 검증 중..."
              )
          });

          const verified = await verifyDelivery(
            match,
            cleanCode,
            20000
          );

          if (!verified) {
            let detail = "";
            try {
              detail = match.last_412?.data
                ? " · 412 응답: " +
                  JSON.stringify(
                    match.last_412.data
                  ).slice(
                    0,
                    700
                  )
                : "";
            } catch (_) {}

            throw Error(
              "HTTP 412: 물리 클릭 후에도 같은 송장번호의 Wise 발송완료를 확인하지 못했어." +
              detail +
              " · DDOGA에는 성공 신호를 보내지 않았어."
            );
          }
          }
        }

        send("DDOGA_WISE_SHIP_PROGRESS", {
          message:
            match.nickname + ": 등록 응답 확인 완료"
        });

        send("DDOGA_WISE_SHIP_SYNC", {
          row: {
            order_id: match.order_id,
            tracking_number: match.tracking_number,
            delivery_id: match.delivery_id,
            wise_user_id:
              match.user_id ||
              match.wise_user_id ||
              null
          }
        });

        results.push({
          order_id: match.order_id,
          nickname: match.nickname,
          ok: true
        });
      } catch (error) {
        results.push({
          order_id: match.order_id,
          nickname: match.nickname,
          ok: false,
          error: error.message
        });
      }
      // 상세 페이지에 남은 채 다음 구매자를 처리하면 탐색 0개가 발생한다.
      // 목록 복귀 실패 시 다음 사람에게 잘못된 배송을 적용하지 않도록 작업 중단.
      if (touchedBuyerUI) {
        try {
          await ensureBuyerList();
        } catch (error) {
          const reason = "목록 복귀 실패 · 후속 자동 등록 중단: " + error.message;
          send("DDOGA_WISE_SHIP_PROGRESS", {message: reason});
          const index = targets.indexOf(match);
          for (const rest of targets.slice(index + 1)) {
            results.push({order_id:rest.order_id,nickname:rest.nickname,ok:false,error:reason});
          }
          break;
        }
      }
    }

    send("DDOGA_WISE_SHIP_RESULT", {
      results
    });
  }

  // 구매자 및 주문 상태 조회
  async function snapshot(resuming = false) {
    activeSnapshotRequest = true;

    if (!resuming) {
      snapshotReconnectRequested = false;
      clearSnapshotResume();
    }

    try {
      send("DDOGA_WISE_SNAPSHOT_PROGRESS", {
        message: resuming
          ? "배송기한 인증 복구 완료 · 구매자 목록 다시 조회 중..."
          : "배송기한 구매자 목록 조회 중..."
      });

      const list = await request(BUYER_LIST_PATH);

      const users = Array.isArray(list.result)
        ? list.result
        : [];

      const records = new Array(users.length);
      let nextIndex = 0;
      let doneCount = 0;
      const startedAt = Date.now();

      send("DDOGA_WISE_SNAPSHOT_PROGRESS", {
        message: "배송기한 조회 시작 · " + users.length + "명"
      });

      async function worker() {
        while (nextIndex < users.length) {
          if (snapshotReconnectRequested) return;
          if (Date.now() - startedAt > 90000) {
            throw Error("배송기한 전체 조회 90초 초과");
          }

          const index = nextIndex++;
          const user = users[index];
          const userId = wiseUserIdOf(user);
          const nickname = wiseNicknameOf(user);

          if (!userId) {
            records[index] = {
              userId: "",
              nickname,
              orders: [],
              error: "와이스 구매자 ID 없음"
            };
            doneCount++;
            continue;
          }

          try {
            const response = await request(
              "/r0.app/sellers/myMarket/orderChains?userId=" +
              encodeURIComponent(userId)
            );

            const chains = Array.isArray(response.result)
              ? response.result
              : [];

            records[index] = {
              userId,
              nickname,
              orders: chains.map(order => ({
                id: order.id,
                status: order.status,
                createdAt: order.createdAt,
                updatedAt: order.updatedAt,
                deliveryCompany: order.deliveryCompany,
                deliveryCode: order.deliveryCode,
                delivery_id: order.delivery_id,
                firstOrderGroupId: order.firstOrderGroupId
              }))
            };
          } catch (error) {
            if (error?.ddogaSnapshotReconnect) throw error;

            records[index] = {
              userId,
              nickname,
              orders: [],
              error: String(error?.message || error)
            };
          } finally {
            doneCount++;

            if (!snapshotReconnectRequested) {
              send("DDOGA_WISE_SNAPSHOT_PROGRESS", {
                message:
                  "배송기한 조회 " +
                  doneCount +
                  "/" +
                  users.length +
                  "명" +
                  (nickname ? " · " + nickname : "")
              });
            }
          }
        }
      }

      await Promise.all(
        Array.from(
          {length: Math.min(4, Math.max(1, users.length))},
          () => worker()
        )
      );

      if (snapshotReconnectRequested) {
        return;
      }

      const completed = records.filter(Boolean);

      clearSnapshotResume();
      snapshotReconnectRequested = false;

      send("DDOGA_WISE_SNAPSHOT_PROGRESS", {
        message:
          "배송기한 조회 완료 · " +
          completed.length +
          "/" +
          users.length +
          "명"
      });

      send("DDOGA_WISE_SNAPSHOT_RESULT", {
        records: completed
      });
    } catch (error) {
      if (error?.ddogaSnapshotReconnect) {
        return;
      }

      clearSnapshotResume();
      snapshotReconnectRequested = false;

      send("DDOGA_WISE_SNAPSHOT_RESULT", {
        records: [],
        error: String(error?.message || error)
      });
    } finally {
      activeSnapshotRequest = false;
    }
  }

  // ── 📦 준비: 확인된 와이스 virtualNumbers API ──
  // POST: /r0.app/sellers/myMarket/virtualNumbers
  // body: {deliveryId: number} / result.virtualPhoneNum: 050 번호
  // 동일 닉네임이라도 여러 배송ID가 있으면 잘못된 번호 방지를 위해 자동처리하지 않습니다.
  const prepSafeNumber = value => {
    const number = digits(value);
    return /^050\d{8,9}$/.test(number) ? number : '';
  };

  async function prepReadChains(userId) {
    const response = await request(
      '/r0.app/sellers/myMarket/orderChains?userId=' + encodeURIComponent(userId)
    );
    if (!Array.isArray(response.result)) throw Error('와이스 주문 응답 형식 확인 실패');
    return response.result;
  }

  // delivery_id별로 묶어 중복된 orderChain이 동일 발급 API를 호출하지 않도록 방지.
  function prepGroupDeliveries(chains) {
    const groups = new Map();
    for (const chain of chains) {
      const deliveryId = Number(chain.delivery_id);
      if (!Number.isSafeInteger(deliveryId) || deliveryId <= 0) continue;
      if (chain.deliveryCode || Number(chain.status) === 25) continue;
      const group = groups.get(deliveryId) || {deliveryId, rows:[]};
      group.rows.push(chain);
      groups.set(deliveryId,group);
    }
    return [...groups.values()];
  }

  async function prepIssueOrReadVirtualNumber(group) {
    const phones = [...new Set(group.rows.map(r =>
      prepSafeNumber(r.virtualPhoneNum || r.virtualphonenum || r.receiverPhoneNum)
    ).filter(Boolean))];
    if (phones.length > 1) throw Error('같은 배송 ID에 서로 다른 안심번호가 있어 자동처리 중단');
    if (phones.length === 1) return {phone:phones[0], already:true};

    // 무작정 중복발급하지 않고, 실제 미발급 대상에만 확인된 API 호출.
    const needed = group.rows.some(r => r.isVirtualPhoneNumRequired === true);
    if (!needed) throw Error('안심번호 발급 필요 여부를 확인할 수 없어 중단');
    const remain = group.rows
      .map(r => Number(r.virtualPhoneNumRemainCount))
      .filter(n => Number.isFinite(n));
    if (remain.length && remain.every(n => n <= 0)) {
      throw Error('안심번호 열람 잔여횟수가 0이라 자동발급하지 않음');
    }

    // 이 POST는 와이스에서 연락처 계속하기를 누를 때 발생한 실제 요청임.
    prepPostedVirtualNumber = true;
    const response = await request(
      '/r0.app/sellers/myMarket/virtualNumbers',
      {method:'POST', body:JSON.stringify({deliveryId:group.deliveryId})}
    );
    let phone = prepSafeNumber(response?.result?.virtualPhoneNum);
    if (!phone) {
      // 와이스 응답이 비어 있다면 같은 delivery_id만 다시 조회해 검증.
      const userId = String(group.rows[0].userId || '');
      if (userId) {
        await wait(500);
        const refreshed = await prepReadChains(userId);
        const matching = refreshed.filter(r => Number(r.delivery_id) === group.deliveryId);
        const all = [...new Set(matching.map(r => prepSafeNumber(r.virtualPhoneNum)).filter(Boolean))];
        if (all.length === 1) phone = all[0];
      }
    }
    if (!phone) throw Error('virtualNumbers 요청 후 050 번호 응답 없음: ' + String(response?.message || '알 수 없음'));
    return {phone, already: response?.message === 'exists'};
  }

  let preparationBusy = false;
  async function preparePhones(token, orders) {
    if (preparationBusy) {
      send('DDOGA_WISE_PREP_RESULT', {token, results:[], error:'다른 준비 작업이 이미 진행 중이야.'});
      return;
    }
    preparationBusy = true;
    activePrepToken = String(token);
    prepPostedVirtualNumber = false;
    prepReconnectRequested = false;
    const results = [];
    try {
      if (!Array.isArray(orders) || !orders.length || orders.length > 100) {
        throw Error('선택 주문은 1~100건이어야 합니다.');
      }
      const selectedBuyers = new Map();
      const seenOrders = new Set();

      for (const row of orders) {
        const order_id =
          String(
            row?.order_id ||
            ""
          ).trim();

        const nickname =
          String(
            row?.nickname ||
            ""
          ).trim();

        const wise_user_id =
          String(
            row?.wise_user_id ||
            ""
          ).trim();

        if (
          !order_id ||
          !nickname ||
          seenOrders.has(
            order_id
          )
        ) {
          throw Error(
            "주문 번호/닉네임 중복 또는 누락"
          );
        }

        seenOrders.add(
          order_id
        );

        const key =
          wise_user_id
            ? "id:" +
              wise_user_id
            : "nick:" +
              norm(
                nickname
              );

        if (
          !selectedBuyers.has(
            key
          )
        ) {
          selectedBuyers.set(
            key,
            {
              nickname,
              wise_user_id:
                wise_user_id ||
                null,

              rows:
                []
            }
          );
        }

        selectedBuyers
          .get(key)
          .rows
          .push({
            order_id,
            nickname,

            wise_user_id:
              wise_user_id ||
              null
          });
      }

      const jobs =
        [
          ...selectedBuyers.values()
        ];
      const total = jobs.length;
      send('DDOGA_WISE_PREP_PROGRESS', {token, message:'선택 ' + total + '명 · 와이스 구매자 목록 확인 중...'});
      // 앱이 이미 받아둔 목록은 재사용. 이것이 8명 모두에 대해 한 번만 필요하다.
      let users = freshBuyerList();
      if (users) {
        send('DDOGA_WISE_PREP_PROGRESS', {
          token, message:'와이스 화면의 구매자 목록 ' + users.length + '명 재사용 · 중복 조회 생략'
        });
      } else {
        send('DDOGA_WISE_PREP_PROGRESS', {token, message:'구매자 목록 캐시 없음 · API 1회 조회 시작'});
        const list = await request(BUYER_LIST_PATH);
        users = Array.isArray(list.result) ? list.result : null;
        if (!users) throw Error('와이스 미발송 구매자 목록 응답 오류 (result 배열 아님)');
        cacheBuyerList(list);
      }
      send('DDOGA_WISE_PREP_PROGRESS', {token, message:'미발송 구매자 ' + users.length + '명 수신 · 선택 ' + total + '명 매칭 중...'});
      const usersByName =
        new Map();

      const usersById =
        new Map();

      for (
        const user of
          users
      ) {
        const uid =
          wiseUserIdOf(
            user
          );

        if (uid) {
          usersById.set(
            uid,
            user
          );
        }

        const key =
          norm(
            wiseNicknameOf(
              user
            )
          );

        if (!key) {
          continue;
        }

        const found =
          usersByName.get(
            key
          ) ||
          [];

        found.push(
          user
        );

        usersByName.set(
          key,
          found
        );
      }

      const matchedCount =
        jobs.filter(
          job =>
            job.wise_user_id
              ? Boolean(
                  usersById.get(
                    job.wise_user_id
                  )
                )
              : (
                  usersByName.get(
                    norm(
                      job.nickname
                    )
                  ) ||
                  []
                ).length === 1
        ).length;

      send(
        "DDOGA_WISE_PREP_PROGRESS",
        {
          token,

          message:
            "Wise ID 우선 매칭 완료 · " +
            matchedCount +
            "/" +
            total +
            "명 확인 · 배송ID 조회 시작..."
        }
      );
      // 여러 명 선택 시에도 조회는 순차 실행한다.
      // API 인증 갱신과 와이스의 요청 지연이 겹쳐 작업 전체가 멈추는 상황을 줄인다.
      // 각 구매자의 조회 오류는 그 사람의 실패 사유로 남기고 다음 구매자로 계속 진행한다.
      // 단, 인증 재접속이 시작된 경우에는 발급 요청을 중단해 중복 처리를 방지한다.
      const inspections = new Array(total);
      for (let i=0; i<total; i++) {
        if (prepReconnectRequested) return;
        const {nickname,wise_user_id} = jobs[i];
        send('DDOGA_WISE_PREP_PROGRESS', {
          token, message:'배송ID 조회 ' + (i+1) + '/' + total + '명 · ' + nickname + ' 확인 중...'
        });
        try {
          let matchedUser =
            null;

          if (
            wise_user_id
          ) {
            matchedUser =
              usersById.get(
                wise_user_id
              ) ||
              null;

            if (!matchedUser) {
              throw Error(
                "Wise 사용자 ID가 미발송 목록에 없음"
              );
            }

          } else {
            const matched =
              usersByName.get(
                norm(
                  nickname
                )
              ) ||
              [];

            if (
              matched.length !==
              1
            ) {
              throw Error(
                matched.length
                  ? "닉네임 중복: 자동처리 중단"
                  : "와이스 미발송 목록에 없는 닉네임"
              );
            }

            matchedUser =
              matched[0];
          }

          const userId =
            wiseUserIdOf(
              matchedUser
            );

          if (!userId) {
            throw Error(
              "와이스 구매자 ID 없음"
            );
          }
          const chains = await prepReadChains(userId);
          const groups = prepGroupDeliveries(chains);
          if (groups.length !== 1) {
            throw Error(groups.length
              ? '미완료 배송ID가 ' + groups.length + '개라 잘못된 발급 방지를 위해 건너뜀'
              : '활성 배송ID 없음');
          }
          inspections[i] = {group:groups[0]};
          send('DDOGA_WISE_PREP_PROGRESS', {
            token, message:'배송ID 조회 ' + (i+1) + '/' + total + '명 완료 · ' + nickname
          });
        } catch (error) {
          if (error?.ddogaPrepReconnect) throw error;
          const reason = String(error?.message || error);
          inspections[i] = {reason};
          send('DDOGA_WISE_PREP_PROGRESS', {
            token, message:'배송ID 조회 ' + (i+1) + '/' + total + '명 실패 · ' + nickname + ': ' + reason
          });
        }
      }
      if (prepReconnectRequested) return;

      // 실제 연락처 열람 POST는 순차 실행. 실패한 주문이 있어도 다른 닉네임을 계속 처리한다.
      for (let i=0; i<total; i++) {
        if (prepReconnectRequested) return;
        const {nickname,rows} = jobs[i];
        const inspection = inspections[i];
        let phone = '';
        let reason = inspection?.reason || '';
        if (inspection?.group && !reason) {
          try {
            send('DDOGA_WISE_PREP_PROGRESS', {token, message:'안심번호 확인 ' + (i+1) + '/' + total + '명 · ' + nickname});
            const response = await prepIssueOrReadVirtualNumber(inspection.group);
            phone = response.phone;
          } catch (error) {
            if (error?.ddogaPrepReconnect) throw error;
            reason = String(error?.message || error);
          }
        }
        for (const row of rows) {
          results.push({order_id:row.order_id,nickname:row.nickname,phone,ok:Boolean(phone),reason});
        }
        send('DDOGA_WISE_PREP_PROGRESS', {token, message:'안심번호 처리 ' + (i+1) + '/' + total + '명 완료 · ' + nickname + (reason ? ' · 실패: ' + reason : ' · 확인 성공')});
      }
      send('DDOGA_WISE_PREP_RESULT', {token, results});
    } catch (error) {
      // GET 단계 인증 새로고침 중에는 실패 결과를 보내지 않고 같은 작업에 재연결한다.
      if (!error?.ddogaPrepReconnect && !prepReconnectRequested) {
        send('DDOGA_WISE_PREP_RESULT', {token, results, error:String(error?.message || error)});
      }
    } finally {
      activePrepToken = '';
      prepPostedVirtualNumber = false;
      preparationBusy = false;
    }
  }

  // DDOGA와 메시지 통신
  window.addEventListener("message", event => {
    if (
      event.origin !== origin ||
      event.source !== window.opener
    ) {
      return;
    }

    if (event.data?.type === "DDOGA_WISE_PREP_PING") {
      send("DDOGA_WISE_PREP_READY", {token:event.data.token, version:"2.4.14", instance:pageInstance});
    }

    // 2.4.5 전용 명령: 구버전 스크립트가 같이 켜져 있어도 중복 발급을 요청받지 않는다.
    if (event.data?.type === "DDOGA_WISE_PREP_REQUEST_V245" &&
        event.data.instance === pageInstance) {
      void preparePhones(event.data.token, event.data.orders || []);
    }

    if (
      event.data?.type ===
      "DDOGA_WISE_SHIP_PING"
    ) {
      if (!hooksInstalled && hasOpener()) {
        installHooks();
      }

      ready();
      maybeResumeSnapshot();
    }

    if (
      event.data?.type ===
      "DDOGA_WISE_SHIP_PREVIEW_REQUEST"
    ) {
      void preview(event.data.orders || []);
    }

    if (
      event.data?.type ===
      "DDOGA_WISE_SHIP_REGISTER_REQUEST"
    ) {
      void register(event.data.order_ids || []);
    }

    if (
      event.data?.type ===
      "DDOGA_WISE_SNAPSHOT_REQUEST"
    ) {
      if (!hooksInstalled && hasOpener()) {
        installHooks();
      }

      void snapshot(false);
    }
  });

  const ready = () =>
    send("DDOGA_WISE_SHIP_READY", {
      version: "2.4.14"
    });

  window.addEventListener("load", () => {
    ready();
    maybeResumeSnapshot();
  });

  window.addEventListener("pageshow", () => {
    ready();
    maybeResumeSnapshot();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      ready();
    }
  });

  ready();

  let readyCount = 0;

  const readyTimer = setInterval(() => {
    ready();

    if (++readyCount >= 30) {
      clearInterval(readyTimer);
    }
  }, 1000);
})();