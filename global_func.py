import datetime
import tkinter as tk
import json
from tkinter import ttk
from tkcalendar import DateEntry

today = datetime.date.today()
curYear = today.year
curMonth = today.month

jsonFile = open("./json-dump.json", "r+")
categoriesIn = []
categoriesOut = []
months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

# json.dump(jsonDump, jsonFile)

saveInfo = json.load(jsonFile)
categoriesIn = saveInfo["Categories In"]
categoriesOut = saveInfo["Categories Out"]


def create_widget(parent, widget_type, **options):
    return widget_type(parent, **options)

# Opens the popup to prompt user for a transaction input. Reads the input and sends
# it to the log_transaction().
def prompt_for_transaction(window, path, log, editBool, index = None, Transaction = None):
    top = tk.Toplevel(window)
    top.title("Enter Transaction")
    top.geometry("250x350")
    top.columnconfigure(0,weight=1)
    top.columnconfigure(1,weight=1)
    top.columnconfigure(2,weight=1)

    top.attributes("-topmost", True)

    directionFrame = create_widget(top, tk.Frame)
    directionFrame.grid(column=1, row=0, padx=15, pady=15)

    inState = 0
    amountTrace = tk.StringVar(value = '$')
    categoryTrace = tk.StringVar()

    inputFrame = create_widget(top, tk.Frame)
    inputFrame.config(width=200, height=200)
    inputFrame.grid(column=1, row=1, padx=15, pady=15)
    inputFrame.columnconfigure(0, weight=1)
    inputFrame.columnconfigure(1, weight=1)

    amountLabel = create_widget(inputFrame, tk.Label, textvariable=tk.StringVar(value="Amount:"), height=1, width=10)
    amountLabel.grid(row=0,column=0, pady=5)

    amountIn = create_widget(inputFrame, tk.Entry, textvariable = amountTrace, width=15)
    amountIn.grid(row=0, column=1, pady = 10)
    amountIn.configure(state="disabled")

    dateLabel = create_widget(inputFrame, tk.Label, textvariable=tk.StringVar(value="Date:"), height=1, width=10)
    dateLabel.grid(row=1,column=0, pady=5)

    dateIn = create_widget(inputFrame, DateEntry, date_pattern="mm-dd-yyyy")
    dateIn.grid(row=1, column=1, pady = 10)
    dateIn.configure(state="disabled")

    categoryLabel = create_widget(inputFrame, tk.Label, textvariable=tk.StringVar(value="Category:"), height=1, width=10)
    categoryLabel.grid(row=2,column=0, pady=5)

    categoryIn = create_widget(inputFrame, ttk.Combobox, textvariable = categoryTrace, values=[])
    categoryIn.grid(row=2, column=1, pady=10)
    categoryIn.set("Select a category")
    categoryIn.configure(state="disabled")

    descriptionLabel = create_widget(inputFrame, tk.Label, textvariable=tk.StringVar(value="Description:"), height=1, width=15)
    descriptionLabel.grid(row=3, column=0, pady=5)

    descriptionIn = create_widget(inputFrame, tk.Text, height=2, width=20)
    descriptionIn.grid(row=3, column=1, pady=10)

    inButton = create_widget(directionFrame, tk.Button, text="Input")
    outButton = create_widget(directionFrame, tk.Button, text="Output")
    inButton.grid(row=0, column=0)
    outButton.grid(row=0, column=1)

    def input_transaction():
        inButton.configure(state="disabled")
        outButton.configure(state="normal")

        amountIn.configure(state="normal")
        dateIn.configure(state="normal")
        categoryIn.configure(state="readonly")

        categoryIn.configure(values=categoriesIn)

        amountIn.delete(0, tk.END)
        amountIn.insert(0, '$')
        dateIn.set_date(today)
        categoryIn.set("Select a category")
        
        nonlocal inState
        inState = 1

    def output_transaction():
        inButton.configure(state="normal")
        outButton.configure(state="disabled")

        amountIn.configure(state="normal")
        dateIn.configure(state="normal")
        categoryIn.configure(state="readonly")

        categoryIn.configure(values=categoriesOut)

        amountIn.delete(0, tk.END)
        amountIn.insert(0, '$')

        dateIn.set_date(today)
        categoryIn.set("Select a category")

        nonlocal inState
        inState = -1

    inButton.configure(command= input_transaction)
    outButton.configure(command= output_transaction)

    def submit_transaction():
        print("Submitting...")
        inputDate = dateIn.get_date()
        fakeTime = datetime.time(0, 0, 0)
        date = datetime.datetime.combine(inputDate, fakeTime)

        amount = amountTrace.get()
        amount = amount.replace('$', '')
        try:
            amount = float(amount)
        except TypeError:
            print(amount + " -- Type Error")
            return

        amount = amount * inState

        category = categoryTrace.get()
        description = descriptionIn.get("1.0", tk.END)

        print(str(type(date)) + ": " + str(date))
        print(str(type(amount)) + ": " + str(amount))
        print(str(type(category)) + ": " + category)
        print(str(type(description)) + ": " + description)

        if (editBool):
            log.edit_transaction(path, date, amount, category, description, index)
        else:
            log.log_transaction(path, date, amount, category, description)

        top.destroy()
    
    submitButton = create_widget(top, tk.Button, text="Submit Transaction", command=submit_transaction)
    submitButton.grid(column=1, row = 2, pady=15)
    submitButton.configure(state="disabled")


    def checkToSubmit():
        if (inState != 0 and amountTrace.get() != "" and amountTrace.get() != '$' and categoryTrace.get() != "" and categoryTrace.get() != "Select a category"):
            submitButton.configure(state="normal")
        else:
            submitButton.configure(state="disabled")

    def amountCallback(var, index, mode):
        nums = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.']

        strLength = len(amountTrace.get())
        for char in amountTrace.get():
            if (char not in nums):
                amountTrace.set(amountTrace.get().replace(char, ""))
        amountTrace.set('$' + amountTrace.get())
        checkToSubmit()
    def catCallback(var, index, mode):
        checkToSubmit()


    if (editBool):
        print("edit mode")
        print("Amount = " + str(Transaction.amount))
        if (Transaction.amount < 0):
            inState = -1
            outButton.configure(state="disabled")
            inButton.configure(state="normal")

            categoryIn.configure(state = "readonly")
            categoryIn.configure(values=categoriesOut)

        else:
            inState = 1
            outButton.configure(state="normal")
            inButton.configure(state="disabled")

            categoryIn.configure(state = "readonly")
            categoryIn.configure(values = categoriesIn)

        amountIn.configure(state = "normal")
        dateIn.configure(state = "normal")
        descriptionIn.configure(state = "normal")

        dateIn.set_date(Transaction.date)
        print(abs(Transaction.amount))
        amountTrace.set('$' + str(abs(Transaction.amount)))
        categoryTrace.set(Transaction.category)
        descriptionIn.delete(1.0, tk.END)
        descriptionIn.insert(tk.END, Transaction.description)

        submitButton.configure(state="normal")

    amountTrace.trace_add('write', amountCallback)
    categoryTrace.trace_add('write', catCallback)

def generate_expectations(frame, defaultBool, month):
    frame.columnconfigure(0, weight=1)
    frame.columnconfigure(1, weight=1)

    inputLabel = create_widget(frame, tk.Label, textvariable=tk.StringVar(value="Input"))
    inputLabel.grid(row=0, column=0, columnspan=2)

    finalRow = 0
    for category in range(len(categoriesIn)):
        categoryLabel = create_widget(frame, tk.Label, textvariable=tk.StringVar(value=categoriesIn[category]))
        categoryLabel.grid(row=category + 1, column=0)

        

        categoryInput = create_widget(frame, tk.Entry, )


def prompt_for_expectations(window):
    top = tk.Toplevel(window)
    top.title("Enter Transaction")
    top.geometry("500x350")
    top.columnconfigure(0,weight=1)
    top.columnconfigure(1,weight=1)

    top.rowconfigure(0, weight=1)
    top.rowconfigure(1, weight=10)
    top.rowconfigure(2, weight=1)

    top.attributes("-topmost", True)

    defaultFrame = create_widget(window, tk.Frame)
    defaultFrame.grid(row=1, column=0)

    monthFrame = create_widget(window, tk.Frame)
    monthFrame.grid(row=1, column=1)

    monthSelect = create_widget(monthFrame, ttk.Combobox, values=months)
    monthSelect.grid(row=0, column=1)
    monthSelect.set("Select a month")


