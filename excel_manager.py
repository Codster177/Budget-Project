import openpyxl as opxl
import tkinter as tk
from tkinter import ttk

class Excel_Manager:
    path = None
    workbook = None

    def __init__(self, path):
        self.path = path
        self.workbook = opxl.load_workbook(self.path)

    def make_excelView(self, sheetName, window):
        sheet = self.workbook[sheetName]
        excelView = self.load_sheet(sheet, window)
        return excelView

    def load_sheet(self, sheet, window):
        list_values = list(sheet.values)
        cols = list_values[0]
        tree = ttk.Treeview(window, column= cols, show="headings")
        tree.config(height=35)

        for col_name in cols:
            tree.heading(col_name, text = col_name)

        for value_tuple in list_values[1:]:
            tree.insert('', tk.END, values=value_tuple)
        return tree

    def destroy_sheet(self, tree):
        tree.destroy()

    def load_path(self):
        self.workbook = opxl.load_workbook(self.path)