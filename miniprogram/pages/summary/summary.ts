import { formatDate, getLedger, money } from '../../services/ledger'

interface Transaction { id: string; amount: number; date: string }
interface SummaryColumn { key: string; label: string; className: string }
interface SummaryCell { key: string; amount: string; date: string; className: string }
interface SummaryRow { key: string; name: string; cells: SummaryCell[] }
interface PersonLedger { name: string; income: Transaction[]; expense: Transaction[] }

Page({
  data: {
    keyword: '',
    received: '0.00',
    sent: '0.00',
    balance: '0.00',
    columns: [] as SummaryColumn[],
    rows: [] as SummaryRow[],
    tableWidth: 586,
    incomeColumns: 0,
    expenseColumns: 0,
  },
  onShow() { this.refresh() },
  search(e: WechatMiniprogram.Input) { this.setData({ keyword: e.detail.value }, () => this.refresh()) },
  refresh() {
    const ledger = getLedger()
    const people = new Map<string, PersonLedger>()
    const getPerson = (name: string): PersonLedger | undefined => {
      const displayName = name.trim()
      if (!displayName) return undefined
      const key = displayName.toLocaleLowerCase()
      let person = people.get(key)
      if (!person) {
        person = { name: displayName, income: [], expense: [] }
        people.set(key, person)
      }
      return person
    }

    for (const banquet of ledger.banquets) {
      for (const gift of banquet.guests) {
        const person = getPerson(gift.name)
        if (person) person.income.push({ id: gift.id, amount: gift.amount, date: gift.date })
      }
    }
    for (const gift of ledger.outgoing) {
      const person = getPerson(gift.name)
      if (person) person.expense.push({ id: gift.id, amount: gift.amount, date: gift.date })
    }

    const allPeople = Array.from(people.values())
    allPeople.forEach((person) => {
      person.income.sort((a, b) => a.date.localeCompare(b.date))
      person.expense.sort((a, b) => a.date.localeCompare(b.date))
    })
    const incomeColumns = Math.max(0, ...allPeople.map((person) => person.income.length))
    const expenseColumns = Math.max(0, ...allPeople.map((person) => person.expense.length))
    const columns: SummaryColumn[] = [
      ...Array.from({ length: incomeColumns }, (_, index) => ({ key: `income-${index}`, label: `收入${index + 1}`, className: 'income-column' })),
      ...Array.from({ length: expenseColumns }, (_, index) => ({ key: `expense-${index}`, label: `支出${index + 1}`, className: 'expense-column' })),
      { key: 'income-total', label: '收入合计', className: 'income-total' },
      { key: 'expense-total', label: '支出合计', className: 'expense-total' },
      { key: 'balance', label: '差额（收入-支出）', className: 'balance-column' },
    ]
    const keyword = this.data.keyword.trim().toLocaleLowerCase()
    const rows: SummaryRow[] = allPeople
      .filter((person) => !keyword || person.name.toLocaleLowerCase().includes(keyword))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
      .map((person) => {
        const incomeTotal = person.income.reduce((sum, transaction) => sum + transaction.amount, 0)
        const expenseTotal = person.expense.reduce((sum, transaction) => sum + transaction.amount, 0)
        const transactionCells: SummaryCell[] = [
          ...Array.from({ length: incomeColumns }, (_, index) => {
            const transaction = person.income[index]
            return { key: `income-${index}`, amount: transaction ? money(transaction.amount) : '', date: transaction ? formatDate(transaction.date) : '', className: 'income-cell' }
          }),
          ...Array.from({ length: expenseColumns }, (_, index) => {
            const transaction = person.expense[index]
            return { key: `expense-${index}`, amount: transaction ? money(transaction.amount) : '', date: transaction ? formatDate(transaction.date) : '', className: 'expense-cell' }
          }),
          { key: 'income-total', amount: money(incomeTotal), date: '', className: 'income-total' },
          { key: 'expense-total', amount: money(expenseTotal), date: '', className: 'expense-total' },
          { key: 'balance', amount: money(incomeTotal - expenseTotal), date: '', className: incomeTotal >= expenseTotal ? 'positive-balance' : 'negative-balance' },
        ]
        return { key: person.name.toLocaleLowerCase(), name: person.name, cells: transactionCells }
      })
    const totalIncome = allPeople.reduce((sum, person) => sum + person.income.reduce((personSum, item) => personSum + item.amount, 0), 0)
    const totalExpense = allPeople.reduce((sum, person) => sum + person.expense.reduce((personSum, item) => personSum + item.amount, 0), 0)
    this.setData({
      received: money(totalIncome),
      sent: money(totalExpense),
      balance: money(totalIncome - totalExpense),
      columns,
      rows,
      tableWidth: 166 + incomeColumns * 152 + expenseColumns * 152 + 360 + 230,
      incomeColumns,
      expenseColumns,
    })
  },
})
