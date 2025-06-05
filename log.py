import pandas as pd
import tkinter as tk
import global_func as gf

class Transaction:
    date = None
    amount = 0
    category = ""
    description = ""

    def __init__(self, date = None, amount = None, category = None, description = None, logSheet = None, index = None):
        if (date != None):
            self.date = date
            self.amount = amount
            self.category = category
            self.description = description
        else:
            logVals = list(logSheet.values)
            self.date = logVals[index][0]
            self.amount = logVals[index][1]
            self.category = logVals[index][2]
            self.description = logVals[index][3]
            print(self.date)
            print(self.amount)
            print(self.category)
            print(self.description)

    def __str__(self):
        return "Date: " + str(self.date) + ", Amount: $" + str(self.amount) + ", Category: " + str(self.category) + ", Description: " + str(self.description)


class Log:
    logTransactions = []
    log_view = None
    log_popup = None

    excelMan = None
    logSheet = None

    def __init__(self, excelMan):
        self.excelMan = excelMan
        self.load_log(excelMan.workbook)

    def createLog(self):
        self.logSheet = self.excelMan.workbook.create_sheet("Log")
        self.logSheet.cell(row=1, column=1, value = "Date")
        self.logSheet.cell(row=1, column=2, value = "Amount")
        self.logSheet.cell(row=1, column=3, value = "Category")
        self.logSheet.cell(row=1, column=4, value = "Description")

    def load_log(self, workbook):
        if ("Log" in workbook.sheetnames):
            self.logSheet = workbook["Log"]
            logValues = list(self.logSheet.values)
            for i in range(1, len(logValues)):
                newTrans = Transaction(logSheet = self.logSheet, index = i)
                self.logTransactions.append(newTrans)
        else:
            self.createLog()

    def sort_logs(self, path, columnName, acending):
        logFrame = pd.read_excel(path, sheet_name="Log")
        logFrame = logFrame.sort_values(by=columnName, ascending=acending)
        logFrame.to_excel(path, sheet_name="Log", index=False)

    def log_transaction(self, path, date, amount, category, description):
        newTransaction = Transaction(date=date, amount=amount, category=category, description=description)
        self.logTransactions.append(newTransaction)
        self.logSheet.append([date, amount, category, description])
        self.excelMan.workbook.save("Tracker.xlsx")
        self.sort_logs(path, "Date", False)
        self.excelMan.load_path()
        self.logSheet = self.excelMan.workbook["Log"]
        
        if (self.log_view != None):
            self.excelMan.destroy_sheet(self.log_view)
            self.log_view = self.excelMan.make_excelView("Log", self.log_popup)
            self.log_view.grid(row=0, column=1)


    def edit_transaction(self, path, date, amount, category, description, index):
        self.logSheet.delete_rows(index)
        self.log_transaction(path, date, amount, category, description)

    
    def edit_row(self, window):
        try:
            selection = self.log_view.selection()[0]
            intSelection = int("0x" + selection[1:], 16)

            selection_trans = Transaction(logSheet=self.logSheet, index=intSelection)
            gf.prompt_for_transaction(window, self.excelMan.path, self, True, intSelection + 1, selection_trans)

            # self.excelMan.workbook.save("Tracker.xlsx")
            # self.excelMan.load_path()
            # self.logSheet = self.excelMan.workbook["Log"]
            # self.excelMan.destroy_sheet(self.log_view)
            # self.log_view = self.excelMan.make_excelView("Log", self.log_popup)
            # self.log_view.grid(row = 0, column=1)
        except:
            return


    def delete_row(self):
        try:
            selection = self.log_view.selection()[0]
            intSelection = int("0x" + selection[1:], 16) + 1
            self.logSheet.delete_rows(intSelection)
            self.excelMan.workbook.save("Tracker.xlsx")
            self.excelMan.load_path()
            self.logSheet = self.excelMan.workbook["Log"]
            self.excelMan.destroy_sheet(self.log_view)
            self.log_view = self.excelMan.make_excelView("Log", self.log_popup)
            self.log_view.grid(row = 0, column=1)
        except:
            return

    def display_log(self, window):
        top = tk.Toplevel(window)
        top.title("Log")

        gf.setupScreenSize(top, manSize=0.7)

        top.columnconfigure(0, weight=1)
        top.columnconfigure(1, weight=3)
        top.columnconfigure(2, weight=1)

        top.attributes('-topmost', True)

        logDisplay = self.excelMan.make_excelView("Log", top)
        logDisplay.grid(row=0, column=1)

        self.log_view = logDisplay
        self.log_popup = top

        buttonFrame = gf.create_widget(top, tk.Frame)
        buttonFrame.grid(row=1, column=1)
        buttonFrame.columnconfigure(0, weight=1)
        buttonFrame.columnconfigure(1, weight=1)

        editBut = gf.create_widget(buttonFrame, tk.Button, text = "Edit", command = lambda: self.edit_row(top))
        editBut.grid(row=0, column=0)

        deleteBut = gf.create_widget(buttonFrame, tk.Button, text = "Delete", command = self.delete_row)
        deleteBut.grid(row=0, column=1)


        top.protocol("WM_DELETE_WINDOW", lambda: self.remove_log(top))

    def get_years(self):
        years = []
        for transactions in self.logTransactions:
            if (transactions.date.year not in years):
                years.append(transactions.date.year)
        years.sort()
        return years
    
    def get_transactions(self):
        return self.logTransactions

    def remove_log(self, top):
        self.log_view = None
        self.log_popup = None
        top.destroy()