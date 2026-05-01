func (s *Store) HandleSearch(w http.ResponseWriter, r *http.Request) {
    query := r.FormValue("search")
    // SQLc generated search using indexes
    txs, _ := s.ListTransactionsSearch(r.Context(), "%"+query+"%")
    
    tmpl := template.Must(template.ParseFiles("ledger_rows.html"))
    tmpl.Execute(w, txs)
}