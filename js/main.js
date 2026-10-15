// 이 파일 안에서만 쓰는 상태와 이벤트 함수를 즉시 실행 함수 안에 모읍니다.
// 바깥 전역 이름을 오염시키지 않으면서 페이지가 준비된 직후 실행됩니다.
(function () {
    "use strict";

    // localStorage에 구독 배열을 저장할 때 사용할 고정 키입니다.
    // 브라우저 개발자 도구에서도 이 키를 검색해 저장된 JSON을 확인할 수 있습니다.
    const STORAGE_KEY = "subscription-tracker.subscriptions";
    // HTML 요소를 한 번 찾아 변수에 저장해 이벤트 연결과 상태 표시에서 재사용합니다.
    const form = document.getElementById("subscription-form");
    const formNotice = document.getElementById("form-notice");
    const submitButton = document.getElementById("submit-button");
    const cancelEditButton = document.getElementById("cancel-edit");
    // subscriptions는 화면에서 사용하는 현재 구독 데이터의 원본 배열입니다.
    let subscriptions = [];
    // 저장소 오류로 기존 데이터가 제대로 읽히지 않았을 때 덮어쓰기를 방지합니다.
    let storageReady = true;

    // 폼 위의 안내 영역에 일반 텍스트로 메시지를 표시합니다.
    function showNotice(message) {
        formNotice.textContent = message;
    }

    // localStorage에서 읽은 값이 화면과 계산 함수가 기대하는 구독 구조인지 검사합니다.
    // 저장 데이터는 오래되었거나 수동으로 변경되었을 수 있으므로 사용 전에 확인합니다.
    function isValidSubscription(subscription) {
        return subscription
            // id와 이름은 문자열이어야 하며 이름이 공백뿐인 값은 허용하지 않습니다.
            && typeof subscription.id === "string"
            && typeof subscription.name === "string"
            && subscription.name.trim() !== ""
            // 금액은 유한한 숫자이며 0 이상이어야 합니다.
            && typeof subscription.amount === "number"
            && Number.isFinite(subscription.amount)
            && subscription.amount >= 0
            // logic.js에서 사용하는 두 결제 주기 값만 허용합니다.
            && (subscription.cycle === "monthly" || subscription.cycle === "yearly")
            // 날짜는 YYYY-MM-DD 모양일 뿐 아니라 실제 달력에 존재하는 날짜여야 합니다.
            && typeof subscription.nextPaymentDate === "string"
            && /^\d{4}-\d{2}-\d{2}$/.test(subscription.nextPaymentDate)
            && !Number.isNaN(Date.parse(`${subscription.nextPaymentDate}T00:00:00Z`))
            && new Date(`${subscription.nextPaymentDate}T00:00:00Z`).toISOString().slice(0, 10) === subscription.nextPaymentDate
            // 카테고리는 비워 둘 수 없고 결제 수단은 문자열이어야 합니다.
            && typeof subscription.category === "string"
            && subscription.category.trim() !== ""
            && typeof subscription.payment === "string";
    }

    // 브라우저 저장소에서 JSON을 읽어 구독 배열로 복원합니다.
    function loadSubscriptions() {
        try {
            const storedValue = localStorage.getItem(STORAGE_KEY);
            // 첫 방문 등 아직 저장된 값이 없으면 빈 목록으로 시작합니다.
            if (storedValue === null) {
                return [];
            }
            // JSON 문자열을 JavaScript 값으로 변환합니다.
            const parsed = JSON.parse(storedValue);
            // 배열이 아니거나 항목 하나라도 구조가 잘못되면 저장 데이터를 신뢰하지 않습니다.
            if (!Array.isArray(parsed) || !parsed.every(isValidSubscription)) {
                throw new Error("저장된 구독 데이터 형식이 올바르지 않습니다.");
            }
            return parsed;
        } catch (error) {
            // 읽기에 실패한 상태에서 빈 배열로 저장하면 기존 데이터를 덮어쓸 수 있으므로
            // 저장 기능을 잠그고 사용자에게 오류 이유를 알립니다.
            storageReady = false;
            showNotice(`저장된 데이터를 읽지 못했습니다. 데이터를 보호하기 위해 저장을 중지했습니다. ${error.message}`);
            submitButton.disabled = true;
            // 오류 복구를 위한 임시 화면은 빈 목록으로 그리되 기존 저장 데이터는 변경하지 않습니다.
            return [];
        }
    }

    // 배열 전체를 JSON 문자열로 변환해 localStorage에 저장합니다.
    function saveSubscriptions(nextSubscriptions) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSubscriptions));
            // 저장 성공을 호출한 쪽에 알려 화면 상태를 갱신하게 합니다.
            return true;
        } catch (error) {
            // 브라우저 저장 공간 부족이나 권한 오류를 숨기지 않고 안내합니다.
            showNotice(`구독을 저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요. ${error.message}`);
            return false;
        }
    }

    // 데이터가 바뀔 때 세 화면 영역을 같은 배열 기준으로 다시 그립니다.
    function refreshView() {
        renderSubscriptions(subscriptions, beginEdit, deleteSubscription);
        renderSummary(subscriptions);
        renderCategories(subscriptions);
    }

    // 입력값과 폼 제목/버튼을 새 구독을 입력하는 기본 상태로 되돌립니다.
    function resetForm() {
        form.reset();
        document.getElementById("subscription-id").value = "";
        document.getElementById("cycle").value = "monthly";
        document.getElementById("form-title").textContent = "새 구독 추가";
        submitButton.textContent = "구독 추가";
        cancelEditButton.classList.add("is-hidden");
        showNotice("");
    }

    // 선택한 구독의 현재 값을 폼에 채우고 폼을 수정 모드로 전환합니다.
    function beginEdit(id) {
        // id가 일치하는 항목을 찾아 사용자 선택이 아직 유효한지 확인합니다.
        const subscription = subscriptions.find(item => item.id === id);
        if (!subscription) {
            showNotice("수정할 구독을 찾을 수 없습니다.");
            return;
        }
        document.getElementById("subscription-id").value = subscription.id;
        document.getElementById("name").value = subscription.name;
        document.getElementById("amount").value = String(subscription.amount);
        document.getElementById("cycle").value = subscription.cycle;
        document.getElementById("next-payment-date").value = subscription.nextPaymentDate;
        document.getElementById("category").value = subscription.category;
        document.getElementById("payment").value = subscription.payment;
        document.getElementById("form-title").textContent = "구독 수정";
        submitButton.textContent = "변경 저장";
        // 수정 취소 버튼을 보여 주고 이름 입력란에 초점을 옮겨 바로 편집하게 합니다.
        cancelEditButton.classList.remove("is-hidden");
        showNotice("");
        document.getElementById("name").focus();
    }

    // 확인을 받은 뒤 특정 구독 한 건을 배열과 저장소에서 제거합니다.
    function deleteSubscription(id) {
        const subscription = subscriptions.find(item => item.id === id);
        if (!subscription || !window.confirm(`"${subscription.name}" 구독을 삭제할까요?`)) {
            return;
        }
        const nextSubscriptions = subscriptions.filter(item => item.id !== id);
        // 저장에 실패하면 메모리의 데이터도 바꾸지 않아 저장소와 화면 간 불일치를 막습니다.
        if (!saveSubscriptions(nextSubscriptions)) {
            return;
        }
        subscriptions = nextSubscriptions;
        // 삭제한 항목을 편집 중이었다면, 더 이상 존재하지 않는 수정 상태를 초기화합니다.
        if (document.getElementById("subscription-id").value === id) {
            resetForm();
        }
        refreshView();
    }

    // 구독 카드마다 겹치지 않는 id를 만듭니다.
    function makeId() {
        // 지원되는 브라우저에서는 충돌 가능성이 매우 낮은 UUID를 사용합니다.
        if (window.crypto && typeof window.crypto.randomUUID === "function") {
            return window.crypto.randomUUID();
        }
        // 구형 브라우저에서는 현재 시각과 임의 문자열을 합친 대체 id를 사용합니다.
        return `sub_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    }

    // 브라우저 기본 제출(페이지 새로고침)을 막고 직접 추가/수정 흐름을 실행합니다.
    form.addEventListener("submit", event => {
        event.preventDefault();
        // 저장 데이터를 읽지 못한 상황에서는 잘못된 빈 데이터로 덮어쓰지 않습니다.
        if (!storageReady) {
            showNotice("저장된 데이터를 읽을 수 없어 구독을 저장할 수 없습니다.");
            return;
        }

        const id = document.getElementById("subscription-id").value;
        // input의 value는 문자열이므로 금액은 숫자로 변환해 계산 함수에 전달합니다.
        const amount = Number(document.getElementById("amount").value);
        const existingSubscription = subscriptions.find(item => item.id === id);
        // 화면 입력값을 계산 로직과 저장소가 사용하는 공통 데이터 모양으로 만듭니다.
        const subscription = {
            id: id || makeId(),
            name: document.getElementById("name").value.trim(),
            amount,
            cycle: document.getElementById("cycle").value,
            nextPaymentDate: document.getElementById("next-payment-date").value,
            category: document.getElementById("category").value.trim(),
            payment: document.getElementById("payment").value.trim()
        };

        // HTML의 required/min 검증 외에도 JavaScript에서 다시 검사해 잘못된 값을 저장하지 않습니다.
        if (!Number.isFinite(amount) || amount < 0 || !isValidSubscription(subscription)) {
            showNotice("이름, 0 이상의 금액, 결제일, 카테고리를 올바르게 입력해 주세요.");
            return;
        }

        // 수정 모드면 같은 id의 항목만 교체하고, 추가 모드면 배열 끝에 새 항목을 붙입니다.
        const nextSubscriptions = existingSubscription
            ? subscriptions.map(item => item.id === id ? subscription : item)
            : [...subscriptions, subscription];

        if (!saveSubscriptions(nextSubscriptions)) {
            return;
        }
        // 저장 성공 후에만 현재 배열을 변경하고 화면을 갱신합니다.
        subscriptions = nextSubscriptions;
        resetForm();
        refreshView();
    });

    // 수정 취소 버튼은 데이터를 저장하지 않고 입력 폼만 초기화합니다.
    cancelEditButton.addEventListener("click", resetForm);

    // 페이지 시작 시 저장 데이터를 읽고, 그 결과로 첫 화면을 그립니다.
    subscriptions = loadSubscriptions();
    refreshView();
}());
