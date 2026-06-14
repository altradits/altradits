// Entry point (Go standard library)

package main

import (
	"html/template"
	"log"
	"net/http"
)

func main() {
	mux := http.NewServeMux()

	// Static assets: css, js, images
	mux.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("web/static"))))

	// Public pages
	mux.HandleFunc("/", homeHandler)

	// TODO: Auth -- wire up internal/handlers/auth.go
	// mux.HandleFunc("/register", handlers.Register)
	// mux.HandleFunc("/login", handlers.Login)
	// mux.HandleFunc("/logout", handlers.Logout)

	// TODO: Customer -- wire up internal/handlers/customer.go
	// mux.HandleFunc("/dashboard", handlers.Dashboard)
	// mux.HandleFunc("/deposit", handlers.Deposit)
	// mux.HandleFunc("/withdraw", handlers.Withdraw)
	// mux.HandleFunc("/send", handlers.Send)
	// mux.HandleFunc("/receive", handlers.Receive)

	// TODO: Businesses -- wire up internal/handlers/business.go
	// mux.HandleFunc("/businesses", handlers.ListBusinesses)
	// mux.HandleFunc("/businesses/add", handlers.AddBusiness)

	// TODO: Investments -- wire up internal/handlers/investment.go
	// mux.HandleFunc("/investments", handlers.ListLocks)
	// mux.HandleFunc("/investments/add", handlers.AddLock)

	// TODO: Profit access -- wire up internal/handlers/profit_access.go
	// mux.HandleFunc("/profit-access", handlers.ChooseProfitAccess)

	// TODO: Trader -- wire up internal/handlers/trader.go
	// mux.HandleFunc("/trader/dashboard", handlers.TraderDashboard)
	// mux.HandleFunc("/trader/assets", handlers.ListAssets)

	// TODO: Admin -- wire up internal/handlers/admin.go
	// mux.HandleFunc("/admin/dashboard", handlers.AdminDashboard)
	// mux.HandleFunc("/admin/distribution", handlers.TriggerDistribution)

	// TODO: Events -- wire up internal/handlers/events.go
	// mux.HandleFunc("/events", handlers.ListEvents)
	// mux.HandleFunc("/events/register", handlers.RegisterForEvent)
	// mux.HandleFunc("/events/organizer/dashboard", handlers.OrganizerDashboard)
	// mux.HandleFunc("/events/organizer/checkin", handlers.QRCheckin)

	// TODO: Hackathon -- wire up internal/handlers/hackathon.go
	// mux.HandleFunc("/hackathon/dashboard", handlers.StudentDashboard)
	// mux.HandleFunc("/hackathon/submit", handlers.SubmitProject)
	// mux.HandleFunc("/hackathon/submissions", handlers.BrowseSubmissions)

	// TODO: Travel -- wire up internal/handlers/travel.go
	// mux.HandleFunc("/travel/packages", handlers.ListPackages)
	// mux.HandleFunc("/travel/book", handlers.BookPackage)

	// TODO: Crowdfunding -- wire up internal/handlers/crowdfunding.go
	// mux.HandleFunc("/campaigns", handlers.ListCampaigns)
	// mux.HandleFunc("/campaigns/donate", handlers.Donate)

	// TODO: Connect internal/db (connection.go, migrations.go) on startup,
	// then protect routes above with internal/middleware/auth.go.

	addr := ":8080"
	log.Println("Altradits server running on http://localhost" + addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}

func homeHandler(w http.ResponseWriter, r *http.Request) {
	tmpl, err := template.ParseFiles("web/templates/layout.html", "web/templates/home.html")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if err := tmpl.ExecuteTemplate(w, "layout", nil); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}
