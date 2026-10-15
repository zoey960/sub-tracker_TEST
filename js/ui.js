// 숫자를 한국어 로캘의 천 단위 쉼표와 원 단위로 보기 좋게 바꿉니다.
// 예: 123456 -> "123,456원"
function formatWon(amount) {
    return `${new Intl.NumberFormat("ko-KR").format(amount)}원`;
}

// HTML 문자열을 직접 조립하지 않고 DOM 요소를 안전하게 만듭니다.
// textContent를 사용하므로 구독 이름에 HTML 문자("<", ">")가 있어도 태그로 실행되지 않습니다.
function createElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) {
        // CSS가 모양을 지정할 수 있도록 필요한 클래스 이름을 설정합니다.
        element.className = className;
    }
    if (text !== undefined) {
        // 전달된 텍스트가 있을 때만 표시 내용을 설정합니다.
        element.textContent = text;
    }
    return element;
}

// 상단 요약 카드 세 개의 내용을 현재 구독 배열로부터 다시 계산합니다.
function renderSummary(subscriptions) {
    // 상세 계산은 logic.js의 공용 함수에 맡깁니다.
    const monthlyTotal = getTotalMonthlyAmount(subscriptions);
    const yearlyTotal = getTotalYearlyAmount(subscriptions);
    // 오늘부터 7일 이내에 결제일이 오는 구독만 반환됩니다.
    const upcomingPayments = getUpcomingPayments(subscriptions, 7);

    // HTML에 미리 만들어 둔 빈 표시 요소에 계산한 텍스트를 채웁니다.
    document.getElementById("monthly-total").textContent = formatWon(monthlyTotal);
    document.getElementById("yearly-total").textContent = formatWon(yearlyTotal);
    document.getElementById("upcoming-count").textContent = `${upcomingPayments.length}건`;
    // 임박한 구독이 있을 때는 금액 합계도 안내하고, 없으면 빈 상태 문구를 보여줍니다.
    document.getElementById("upcoming-note").textContent = upcomingPayments.length
        ? `예정 금액 ${formatWon(upcomingPayments.reduce((sum, item) => sum + item.amount, 0))} · 앞으로 7일`
        : "앞으로 7일 이내 결제 없음";
}

// 컴퓨터의 현지 날짜를 YYYY-MM-DD 문자열로 만듭니다.
// getDaysUntilPayment에 날짜만 넘겨 시각대 차이로 인한 D-day 오류를 줄입니다.
function getTodayDateString() {
    const today = new Date();
    const year = today.getFullYear();
    // 월은 0부터 시작하므로 사람이 사용하는 1~12월에 맞게 1을 더합니다.
    // padStart는 한 자리 월/일 앞에 0을 붙여 두 자리 문자열을 보장합니다.
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

// 구독 배열을 카드 목록으로 그립니다.
// onEdit와 onDelete는 실제 수정/삭제를 담당하는 함수이며 main.js에서 전달받습니다.
function renderSubscriptions(subscriptions, onEdit, onDelete) {
    const list = document.getElementById("subscription-list");
    // 이전 화면을 비운 뒤 현재 데이터 기준으로 새 카드를 만듭니다.
    list.replaceChildren();
    document.getElementById("subscription-count").textContent = `${subscriptions.length}개`;

    // 데이터가 없을 때도 화면이 비어 보이지 않도록 안내 문구를 표시합니다.
    if (subscriptions.length === 0) {
        list.append(createElement("p", "empty-state", "아직 등록된 구독이 없어요.\n오른쪽 폼에서 첫 구독을 추가해 보세요."));
        return;
    }

    // 모든 카드의 D-day 계산에 같은 오늘 날짜 문자열을 재사용합니다.
    const today = getTodayDateString();
    subscriptions.forEach(subscription => {
        // 카드의 각 부분을 DOM API로 만들고 적절한 CSS 클래스를 부여합니다.
        const card = createElement("article", "subscription-card");
        const info = createElement("div", "subscription-info");
        const name = createElement("p", "subscription-name", subscription.name);
        const meta = createElement("div", "subscription-meta");
        const category = createElement("span", "", subscription.category);
        const date = createElement("span", "", `다음 결제 ${subscription.nextPaymentDate}`);
        // logic.js가 오늘과 결제 예정일의 차이를 일수로 계산합니다.
        const days = getDaysUntilPayment(today, subscription.nextPaymentDate);
        // 과거 날짜, 오늘, 미래 날짜를 각각 읽기 쉬운 문구로 바꿉니다.
        const due = createElement("span", "due-badge", days < 0
            ? `${Math.abs(days)}일 지남`
            : days === 0 ? "오늘 결제" : `D-${days}`);
        const amount = createElement("p", "subscription-price");
        // 카드에는 주기와 관계없이 월 기준 금액을 표시해 서로 쉽게 비교할 수 있게 합니다.
        const price = createElement("span", "", formatWon(getMonthlyAmount(subscription)));
        const cycle = createElement("small", "", " / 월");
        const actions = createElement("div", "card-actions");
        const editButton = createElement("button", "icon-button", "수정");
        const deleteButton = createElement("button", "icon-button delete-button", "삭제");

        // 3일 안에 결제되면 강조색을 적용합니다. 오늘은 별도의 클래스를 사용합니다.
        if (days >= 0 && days <= 3) {
            due.classList.add(days === 0 ? "is-today" : "is-soon");
        }
        // 아이콘 대신 텍스트를 표시하지만, 보조 기술에도 구체적인 의미를 전달합니다.
        due.setAttribute("aria-label", days < 0 ? `결제일 ${Math.abs(days)}일 지남` : days === 0 ? "오늘 결제" : `결제까지 ${days}일`);
        // 카드 내용의 계층을 만든 뒤 카드 안에 배치합니다.
        meta.append(category, date);
        info.append(name, meta, due);
        amount.append(price, cycle);

        // 버튼은 폼 제출 버튼이 아니며 클릭 시 구독 id를 콜백으로 넘깁니다.
        editButton.type = "button";
        editButton.setAttribute("aria-label", `${subscription.name} 수정`);
        editButton.addEventListener("click", () => onEdit(subscription.id));
        deleteButton.type = "button";
        deleteButton.setAttribute("aria-label", `${subscription.name} 삭제`);
        deleteButton.addEventListener("click", () => onDelete(subscription.id));
        // 완성한 카드를 문서에 추가해 사용자에게 보이게 합니다.
        actions.append(editButton, deleteButton);
        card.append(info, amount, actions);
        list.append(card);
    });
}

// 월 기준 금액을 카테고리별로 모아 막대 그래프와 비율을 그립니다.
function renderCategories(subscriptions) {
    const container = document.getElementById("category-list");
    // 이 함수도 logic.js의 계산 결과를 사용합니다.
    const categories = getMonthlyAmountByCategory(subscriptions);
    // 큰 지출 카테고리가 먼저 보이도록 금액 내림차순으로 정렬합니다.
    const entries = Object.entries(categories).sort((first, second) => second[1] - first[1]);
    container.replaceChildren();

    // 구독 데이터가 없으면 그래프 대신 빈 상태 안내를 표시합니다.
    if (entries.length === 0) {
        container.append(createElement("p", "category-empty", "구독을 추가하면\n카테고리별 비중을 보여드려요."));
        return;
    }

    // 모든 카테고리 월 금액의 합이 막대 비율을 계산할 기준입니다.
    const total = entries.reduce((sum, entry) => sum + entry[1], 0);
    // 각 카테고리 막대 색을 순환해 사용합니다. 카테고리 개수에는 제한이 없습니다.
    const colors = ["#6d5ce8", "#4e9bdb", "#e49c55", "#55ad91", "#df7186", "#8d76c7"];
    entries.forEach(([category, amount], index) => {
        const row = createElement("div", "category-row");
        const labels = createElement("div", "category-label-line");
        const name = createElement("span", "category-name", category);
        // 전체 금액이 0일 때 0으로 나누지 않도록 예외 처리합니다.
        const share = total === 0 ? 0 : Math.round((amount / total) * 100);
        const value = createElement("span", "category-amount", `${formatWon(amount)} · ${share}%`);
        const track = createElement("div", "category-track");
        const bar = createElement("div", "category-bar");

        // 막대 그래프의 의미는 화면에 보이지 않는 설명 문구로도 제공됩니다.
        track.setAttribute("role", "img");
        track.setAttribute("aria-label", `${category} 월 구독료 비중 ${share}%`);
        // 막대 길이는 비율(%)이며 색상은 인라인 CSS 변수로 전달합니다.
        bar.style.width = `${share}%`;
        bar.style.setProperty("--bar-color", colors[index % colors.length]);
        // 이름/금액, 막대, 행 순으로 조립해 목록에 추가합니다.
        labels.append(name, value);
        track.append(bar);
        row.append(labels, track);
        container.append(row);
    });
}
