package main

import (
	"fmt"
	"html/template"
	"math/rand"
	"net/http"
	"strings"
	"time"
)

type Transaction struct {
	ID     string
	Type   string
	Amount float64
	Status string
}

var ledger = []Transaction{
	{"ALTR-001", "Inbound", 5000.00, "Pending"},
	{"ALTR-002", "Outbound", 1200.50, "Pending"},
	{"ALTR-003", "Vault Sweep", 0.00, "Approved"},
}

func main() {
	// Root: Load Command Center
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		tmpl := template.Must(template.ParseFiles("index.html", "ledger_partials.html"))
		tmpl.Execute(w, ledger)
	})

	// 1. Search Logic
	http.HandleFunc("/search", func(w http.ResponseWriter, r *http.Request) {
		query := strings.ToLower(r.FormValue("search"))
		var filtered []Transaction
		for _, tx := range ledger {
			if strings.Contains(strings.ToLower(tx.ID), query) {
				filtered = append(filtered, tx)
			}
		}
		tmpl := template.Must(template.ParseFiles("ledger_partials.html"))
		tmpl.ExecuteTemplate(w, "ledger-rows", filtered)
	})

	// 2. Bulk Action
	http.HandleFunc("/bulk-approve", func(w http.ResponseWriter, r *http.Request) {
		r.ParseForm()
		ids := r.Form["tx_ids"]
		for _, id := range ids {
			for i, tx := range ledger {
				if tx.ID == id { ledger[i].Status = "Approved" }
			}
		}
		tmpl := template.Must(template.ParseFiles("ledger_partials.html"))
		tmpl.ExecuteTemplate(w, "ledger-rows", ledger)
	})

	// 3. Heartbeat (Polling)
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, `<div class="flex items-center gap-2 text-emerald-400 text-[10px] uppercase font-bold">
			<span class="relative flex h-2 w-2"><span class="animate-ping absolute h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span class="h-2 w-2 rounded-full bg-emerald-500"></span></span>
			Engine Load: %d%%</div>`, rand.Intn(15)+5)
	})

	fmt.Println("⚡ COMMAND CENTER ONLINE: http://localhost:8080")
	http.ListenAndServe(":8080", nil)
}